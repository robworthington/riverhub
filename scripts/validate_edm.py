#!/usr/bin/env python3
"""Validate our loaded EDM overflow data against the authoritative EA annual return.

Cross-checks what we loaded into the national DB for one water company against the Environment Agency's
EDM Storm Overflow Annual Return for a given year — the official, validated record of counted spills
(12/24-hour method) and durations per outlet. The EA return is read live from The Rivers Trust's ArcGIS
mirror (queryable without downloading the ZIP); our side is read straight from the national DB.

It reports two things:
  1. Aggregate reconciliation — our distinct outlets / total spills / total hours / avg EDM-operation %
     vs the company-wide EA figures. We expect OUR numbers to be a SUBSET of the company total (we onboard
     river catchments, so coastal/estuarine outlets outside any catchment are legitimately not covered);
     the script reports our share and flags only an impossible overshoot (ours > EA).
  2. Per-outlet spot-check — for the top-N spillers on our side, match the nearest EA return record by
     location and compare counted spills + hours. Because our annual stats derive from the same EDM return,
     these should match EXACTLY; any mismatch is a real data problem and makes the script exit non-zero.

Dependencies: none beyond the stdlib + a way to reach Postgres — a local `psql`, else dockerised
`postgres:16` (same local-or-docker pattern the importers use). No DB driver needed.

Usage:
  export DB_URL="<national pooler url>"
  python3 scripts/validate_edm.py --year 2024                       # defaults to South West Water
  python3 scripts/validate_edm.py --year 2024 --company "South West Water" --top 10
  python3 scripts/validate_edm.py --year 2023 --db "$DB_URL" --radius 0.004

Exit code: 0 if every per-outlet spot-check matched (within --tolerance) and our aggregate is a plausible
subset of the EA total; 1 otherwise — so it is usable as a CI / pre-go-live gate.
"""
import argparse
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request

ARC = "https://services3.arcgis.com/Bb8lfThdhugyc4G3/ArcGIS/rest/services"
SSL = ssl.create_default_context()


def psql(db_url, sql):
    """Run a query via local psql if present, else dockerised postgres:16 (tab-separated, no headers)."""
    base = ["-v", "ON_ERROR_STOP=1", "-qAt", "-F", "\t"]
    if shutil.which("psql"):
        cmd = ["psql", db_url] + base
    else:
        local = "127.0.0.1" in db_url or "localhost" in db_url
        cmd = ["docker", "run", "--rm", "-i"] + (["--network", "host"] if local else []) + \
              ["postgres:16", "psql", db_url] + base
    r = subprocess.run(cmd + ["-c", sql], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"psql failed: {r.stderr.strip() or r.stdout.strip()}")
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def _arc_get(url):
    return json.load(urllib.request.urlopen(url, timeout=120, context=SSL))


def arc_query(service, params):
    return _arc_get(f"{ARC}/{service}/FeatureServer/0/query?" + urllib.parse.urlencode(params))


def _candidate_services(year):
    """EA/Rivers-Trust service names that could hold the single-year return for `year`, best first.

    The mirror's naming is inconsistent (single-year national returns, multi-year 'SW_EDM_2018_2022'-style
    services with year-suffixed fields and an unpopulated company filter, 'tidy' rebuilds, …). We score so
    the clean single-year national service wins: penalise multi-year ranges and the SW_* services, reward
    the recognisable national-return names.
    """
    import re
    names = [s["name"] for s in _arc_get(f"{ARC}?f=json").get("services", []) if s.get("type") == "FeatureServer"]
    y = str(year)
    cands = [n for n in names if y in re.findall(r"(?:19|20)\d{2}", n)]  # year present as a whole token

    def score(n):
        years = set(re.findall(r"(?:19|20)\d{2}", n))
        s = len(n) * 0.001
        if len(years) > 1:
            s += 100        # multi-year range → year-suffixed fields, often empty company filter
        if n.startswith("SW_"):
            s += 50         # SW_* services return 0 for a waterCompanyName filter
        for kw, bonus in (("Annual_Return", -12), ("Event_Duration", -10), ("tidy", -8), ("EDM", -4)):
            if kw in n:
                s += bonus
        return s

    return sorted(cands, key=score)


def _fields_of(service):
    return _arc_get(f"{ARC}/{service}/FeatureServer/0?f=json").get("fields", [])


def _resolve_fields(fields, year):
    """Map needed columns onto a layer's field names. Prefer the clean base name, then a year-suffixed one."""
    by_lower = {f["name"].lower(): f["name"] for f in fields}

    def pick(*bases):
        for b in bases:                                   # exact base, e.g. 'countedSpills'
            if b.lower() in by_lower:
                return by_lower[b.lower()]
        for b in bases:                                   # year-suffixed, e.g. 'countedSpills2023'
            if (b + str(year)).lower() in by_lower:
                return by_lower[(b + str(year)).lower()]
        return None

    def heur(*preds):
        for f in fields:
            hay = (f["name"] + " " + (f.get("alias") or "")).lower()
            if all(p in hay for p in preds):
                return f["name"]
        return None

    return dict(
        company=pick("waterCompanyName") or heur("company"),
        spills=pick("countedSpills") or heur("counted", "spill") or heur("spill", "count"),
        hours=pick("totalDurationAllSpillsHrs") or heur("duration", "hr") or heur("duration", "hour"),
        operation=pick("edmOperationPercent") or heur("operation", "%") or heur("edm", "operation"),
        site=pick("siteNameWASC", "siteNameEA") or heur("site", "name"),
        lat=pick("Latitude") or "Latitude",
        lng=pick("Longitude") or "Longitude",
    )


def resolve_source(year, company, override):
    """Choose the service + field map that actually holds this company's rows for `year`.

    Walk the scored candidates and accept the first whose company/spills/hours fields resolve AND whose
    company filter returns rows — self-correcting past a well-named but empty/mis-structured service.
    """
    candidates = [override] if override else _candidate_services(year)
    tried = []
    for svc in candidates:
        fields = _fields_of(svc)
        f = _resolve_fields(fields, year)
        if not (f["company"] and f["spills"] and f["hours"]):
            tried.append(f"{svc} (missing fields)")
            continue
        n = arc_query(svc, {"where": f"{f['company']}={q(company)}", "returnCountOnly": "true", "f": "json"}).get("count", 0)
        if n and n > 0:
            return svc, f
        tried.append(f"{svc} (0 rows for {company})")
    sys.exit(f"no EA service with {company} data for {year}. Tried: {tried}. "
             f"Pass --service <name> explicitly.")


def q(value):
    """Single-quote a literal for SQL / ArcGIS where-clauses (double embedded quotes)."""
    return "'" + str(value).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser(description="Validate loaded EDM data against the EA annual return.")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--company", default="South West Water",
                    help="company name as it appears in BOTH organisations.company_name and the EA return")
    ap.add_argument("--db", default=os.environ.get("DB_URL"), help="Postgres URL (or set DB_URL)")
    ap.add_argument("--top", type=int, default=6, help="number of top spillers to spot-check per-outlet")
    ap.add_argument("--radius", type=float, default=0.004,
                    help="degrees; match an EA outlet within this box of ours (~0.004 ≈ 300-400 m)")
    ap.add_argument("--tolerance", type=int, default=0, help="allowed abs diff in per-outlet spill count")
    ap.add_argument("--service", default=None, help="override the EA FeatureServer name")
    args = ap.parse_args()
    if not args.db:
        sys.exit("no DB URL — pass --db or set DB_URL")

    service, f = resolve_source(args.year, args.company, args.service)
    print(f"EA source: {service}  (fields: spills={f['spills']}, hours={f['hours']}, company={f['company']})")
    print(f"Company:   {args.company}   Year: {args.year}\n")

    # --- our side (national DB) ---
    our_where = f"o.company_name = {q(args.company)} and o.live and a.year = {args.year}"
    agg = psql(args.db, f"""
        select count(distinct s.asset_unique_id),
               coalesce(sum(a.spill_count), 0),
               coalesce(round(sum(a.total_duration_hours)), 0),
               coalesce(round(avg(a.reporting_pct)::numeric, 1), 0)
        from edm_annual_stats a
        join sewage_assets s on s.id = a.asset_id
        join organisations o on o.id = a.organisation_id
        where {our_where};""")[0]
    our_outlets, our_spills, our_hours, our_rep = int(agg[0]), int(float(agg[1])), int(float(agg[2])), float(agg[3])

    top = psql(args.db, f"""
        select s.asset_name, round(s.latitude::numeric, 5), round(s.longitude::numeric, 5),
               a.spill_count, round(a.total_duration_hours)
        from edm_annual_stats a
        join sewage_assets s on s.id = a.asset_id
        join organisations o on o.id = a.organisation_id
        where {our_where}
        order by a.spill_count desc
        limit {args.top};""")

    # --- EA side (annual return mirror) ---
    ea_where = f"{f['company']}={q(args.company)}"
    ea_count = arc_query(service, {"where": ea_where, "returnCountOnly": "true", "f": "json"}).get("count", 0)
    stats = [{"statisticType": "sum", "onStatisticField": f["spills"], "outStatisticFieldName": "spills"},
             {"statisticType": "sum", "onStatisticField": f["hours"], "outStatisticFieldName": "hours"}]
    if f["operation"]:
        stats.append({"statisticType": "avg", "onStatisticField": f["operation"], "outStatisticFieldName": "op"})
    ea = arc_query(service, {"where": ea_where, "outStatistics": json.dumps(stats), "f": "json"})["features"][0]["attributes"]
    ea_spills, ea_hours = int(round(ea["spills"])), int(round(ea["hours"]))
    ea_rep = round(ea["op"], 1) if f["operation"] and ea.get("op") is not None else None

    def share(a, b):
        return f"{100*a/b:.1f}%" if b else "n/a"

    print("AGGREGATE (ours = subset of company total; coastal/estuary outlets outside catchments are not covered)")
    print(f"  {'metric':16}{'ours':>12}{'EA company':>14}{'our share':>12}")
    print(f"  {'outlets':16}{our_outlets:>12}{ea_count:>14}{share(our_outlets, ea_count):>12}")
    print(f"  {'spills':16}{our_spills:>12}{ea_spills:>14}{share(our_spills, ea_spills):>12}")
    print(f"  {'hours':16}{our_hours:>12}{ea_hours:>14}{share(our_hours, ea_hours):>12}")
    print(f"  {'avg EDM op %':16}{our_rep:>12}{str(ea_rep):>14}")

    overshoot = our_spills > ea_spills or our_outlets > ea_count
    if overshoot:
        print("  !! OUR total exceeds the EA company total — impossible for a subset; investigate.")

    # --- per-outlet spot-check ---
    # Goal: confirm OUR per-outlet figure is a genuine EA figure at that location. At a multi-outlet works
    # (STWs can have several co-located EDM outlets) the SWW operational names and the EA consents-DB names
    # don't always map 1:1, so a nearest-point name match is brittle. We therefore match within the radius
    # by, in order: (1) an EA record with the SAME spills AND hours (near-certain same outlet, even if named
    # differently — flag a name difference as INFO, not a failure); (2) best site-name token overlap;
    # (3) nearest point. Only a figure with no same-value match AND a differing best-name value is a MISMATCH.
    print(f"\nPER-OUTLET SPOT-CHECK (top {len(top)} spillers; EA record within {args.radius}° of ours)")
    print(f"  {'our site':26}{'ours':>7}{'EA':>7}{'our_hrs':>9}{'EA_hrs':>8}  via   EA site")
    out = [x for x in (f["site"], f["spills"], f["hours"], f["lat"], f["lng"]) if x]

    def toks(s):
        return {w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(w) > 2}

    mismatches = 0
    for name, lat, lng, osp, ohr in top:
        lat, lng, osp, ohr = float(lat), float(lng), int(float(osp)), int(float(ohr))
        d = args.radius
        env = f"{lng-d},{lat-d},{lng+d},{lat+d}"
        feats = [ft["attributes"] for ft in arc_query(service, {
            "where": ea_where, "geometry": env, "geometryType": "esriGeometryEnvelope", "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects", "outFields": ",".join(out), "f": "json"}).get("features", [])]
        if not feats:
            print(f"  {name[:26]:26}{osp:>7}{'--':>7}{ohr:>9}{'--':>8}  --    (no EA outlet within radius)")
            mismatches += 1
            continue

        def sp(a):
            return int(a[f["spills"]]) if a.get(f["spills"]) is not None else None

        def hr(a):
            return int(round(a[f["hours"]])) if a.get(f["hours"]) is not None else None

        exact = [a for a in feats if sp(a) == osp and hr(a) == ohr]
        ours_tok = toks(name)
        if exact:
            chosen, via = exact[0], "val"            # same spills AND hours at this location
        elif f["site"] and max((len(toks(a.get(f["site"])) & ours_tok) for a in feats), default=0) > 0:
            chosen = max(feats, key=lambda a: (len(toks(a.get(f["site"])) & ours_tok),
                                               -((a[f["lat"]]-lat)**2 + (a[f["lng"]]-lng)**2)))
            via = "name"
        else:
            chosen = min(feats, key=lambda a: (a[f["lat"]]-lat)**2 + (a[f["lng"]]-lng)**2)
            via = "loc"
        esp, ehr = (sp(chosen) if sp(chosen) is not None else -1), (hr(chosen) if hr(chosen) is not None else -1)
        site = (chosen.get(f["site"]) or "?")[:30] if f["site"] else "?"
        bad = abs(esp - osp) > args.tolerance
        mismatches += bad
        # name differs but value matched (cross-system naming at a cluster) — informational, not a failure
        info = "  (EA name differs — co-located cluster)" if (via == "val" and f["site"]
               and ours_tok and not (toks(site) & ours_tok)) else ""
        print(f"  {name[:26]:26}{osp:>7}{esp:>7}{ohr:>9}{ehr:>8}  {via:5} {site}"
              f"{'   <-- MISMATCH' if bad else info}")

    ok = mismatches == 0 and not overshoot
    print(f"\n{'PASS' if ok else 'FAIL'}: {len(top)-mismatches}/{len(top)} outlets matched"
          f"{'' if not overshoot else ', aggregate overshoot'}.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
