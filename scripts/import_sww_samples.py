#!/usr/bin/env python3
"""
Import South West Water bacterial sampling data (two EIR files) as their own SWW-tagged sites.

  File 1: SWW-BacterialSamplingData-Dart-230124.xlsx  — 'Sampling locations' (OS grid E/N) +
          'All bacti data' (Date|Site|Time|Weather|Salinity|E.coli|Enterococci|Notes)
  File 2: EIR24364 Q2 River Hems.xlsx — 'Results' (Date|Time|Location|Enterococci|E.coli|Comments)

Sites are imported as new "… (SWW)" sites (no auto-merge); geocoded File-1 sites get lat/long via
PostGIS ST_Transform (EPSG:27700→4326) + parish; un-geocoded sites are created without coordinates.
Results map to E. coli (culture) + Intestinal enterococci (culture), collector "South West Water",
weather→condition. Idempotent on a deterministic source_ref.

Usage:
    python3 import_sww_samples.py > /tmp/sww.sql
    docker run --rm -i --network host postgres:16 psql "$DB_URL" < /tmp/sww.sql
"""
import sys, re, datetime, openpyxl

ORG = "00000000-0000-0000-0000-000000000001"
DL = "/Users/robertworthington/Downloads/"
F1 = DL + "SWW-BacterialSamplingData-Dart-230124.xlsx"
F2 = DL + "EIR24364 Q2 River Hems.xlsx"
TIDAL_HINTS = ("stoke gabriel", "dittisham", "dart estate", "dartmouth", "totnes riverside",
               "totnes aquathon", "warfleet", "estuary")


def nk(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower()).replace("brigde", "bridge")


def lit(s):
    return "NULL" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def parse_date(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v or "").strip()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else None


def parse_time(v):
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M:%S")
    m = re.match(r"(\d{1,2}):(\d{2})", str(v or ""))
    return f"{int(m.group(1)):02d}:{m.group(2)}:00" if m else None


def weather_cond(w):
    s = str(w or "").strip().lower()
    if not s:
        return None
    if any(k in s for k in ("rain", "wet", "shower", "storm")):
        return "wet"
    if any(k in s for k in ("dry", "sun", "clear", "fair", "overcast", "cloud")):
        return "dry"
    return None


def qual_val(v):
    s = str(v or "").strip()
    if not s:
        return None, None
    m = re.match(r"^([<>]?)\s*(\d+(?:\.\d+)?)$", s)
    if not m:
        return None, None
    return (m.group(1) or "="), m.group(2)


def main():
    sites = {}   # display name -> {en:(e,n)|None, tidal, source}
    results = []  # (site, tt, date, time, org, qual, val, cond, weather, obs, src, ref)

    # ---------- File 1 ----------
    wb = openpyxl.load_workbook(F1, read_only=True, data_only=True)
    locs = {}
    for r in list(wb["Sampling locations"].iter_rows(values_only=True))[1:]:
        if r and r[0] and r[1] and r[2]:
            locs[nk(r[0])] = (int(r[1]), int(r[2]))
    for r in list(wb["All bacti data"].iter_rows(values_only=True))[1:]:
        if not r or not r[1]:
            continue
        raw = str(r[1]).strip()
        date = parse_date(r[0])
        if not date:
            continue
        disp = f"{raw} (SWW)"
        en = locs.get(nk(raw))
        # only treat as Dart-area coord if within rough easting band (exclude Tavy/Tamar refs)
        if en and not (270000 <= en[0] <= 290000):
            en = None
        sites.setdefault(disp, {"en": en, "tidal": any(h in nk(raw) for h in TIDAL_HINTS), "src": "sww_bacti"})
        if en and sites[disp]["en"] is None:
            sites[disp]["en"] = en
        tm = parse_time(r[2]); cond = weather_cond(r[3])
        obs_bits = [b for b in [f"weather: {r[3]}" if r[3] else "", f"salinity: {r[4]}" if r[4] not in (None, "") else "", str(r[7]).strip() if r[7] else ""] if b]
        obs = "; ".join(obs_bits) or None
        for tt, col in (("E. coli (culture)", 5), ("Intestinal enterococci (culture)", 6)):
            q, v = qual_val(r[col] if len(r) > col else None)
            if v is None:
                continue
            ref = f"sww1|{disp}|{date}|{tm or ''}|{tt}"
            results.append((disp, tt, date, tm, "South West Water", q, v, cond, str(r[3] or "") or None, obs, "sww_bacti", ref))
    wb.close()

    # ---------- File 2 (River Hems) ----------
    wb = openpyxl.load_workbook(F2, read_only=True, data_only=True)
    rows = list(wb["Results"].iter_rows(values_only=True))
    canon = {}  # normalised -> first-seen display
    for r in rows[4:]:
        if not r or not r[3]:
            continue
        loc = re.sub(r"\s+", " ", str(r[3]).replace("@", "at")).strip().rstrip(".")
        key = nk(loc).rstrip(".")
        disp_base = canon.setdefault(key, loc)
        disp = f"{disp_base} (SWW Hems)"
        date = parse_date(r[1])
        if not date:
            continue
        sites.setdefault(disp, {"en": None, "tidal": False, "src": "sww_hems_eir"})
        tm = parse_time(r[2])
        obs = str(r[6]).strip() if r[6] else None
        for tt, col in (("Intestinal enterococci (culture)", 4), ("E. coli (culture)", 5)):
            q, v = qual_val(r[col] if len(r) > col else None)
            if v is None:
                continue
            ref = f"swwhems|{disp}|{date}|{tm or ''}|{tt}"
            results.append((disp, tt, date, tm, "South West Water", q, v, weather_cond(r[6]), None, obs, "sww_hems_eir", ref))
    wb.close()

    # dedupe results on source_ref (same site+date+time+analyte from spelling variants / repeats)
    results = list({r[-1]: r for r in results}.values())
    geo = sum(1 for s in sites.values() if s["en"])
    print(f"-- {len(sites)} SWW sites ({geo} geocoded, {len(sites)-geo} need coords), {len(results)} results", file=sys.stderr)

    out = ["-- River Hub: SWW bacterial sampling import (idempotent)", "begin;"]
    # sites
    for name, s in sites.items():
        note = "South West Water sampling site." + ("" if s["en"] else " Coordinates pending — not yet on maps.")
        if s["en"]:
            e, n = s["en"]
            out.append(
                f"insert into test_sites (organisation_id, name, type, tidal, latitude, longitude, notes)\n"
                f"select '{ORG}', {lit(name)}, 'community_designated', {str(s['tidal']).lower()},\n"
                f"  ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint({e},{n}),27700),4326)),\n"
                f"  ST_X(ST_Transform(ST_SetSRID(ST_MakePoint({e},{n}),27700),4326)), {lit(note)}\n"
                f"where not exists (select 1 from test_sites where organisation_id='{ORG}' and name={lit(name)});"
            )
        else:
            out.append(
                f"insert into test_sites (organisation_id, name, type, tidal, notes)\n"
                f"select '{ORG}', {lit(name)}, 'community_designated', {str(s['tidal']).lower()}, {lit(note)}\n"
                f"where not exists (select 1 from test_sites where organisation_id='{ORG}' and name={lit(name)});"
            )
    # parish for newly geocoded
    out.append(f"""
update test_sites t set parish_id = p.id from parishes p
where t.organisation_id='{ORG}' and t.parish_id is null and t.latitude is not null and p.boundary is not null
  and ST_Contains(p.boundary, ST_SetSRID(ST_Point(t.longitude, t.latitude), 4326));
update test_sites t set parish_id = nn.pid from (
  select t2.id sid,
    (select p.id from parishes p where p.boundary is not null order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) pid,
    (select ST_Distance(p.boundary::geography, ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326)::geography) from parishes p where p.boundary is not null order by p.boundary <-> ST_SetSRID(ST_Point(t2.longitude,t2.latitude),4326) limit 1) dist
  from test_sites t2 where t2.organisation_id='{ORG}' and t2.parish_id is null and t2.latitude is not null
) nn where t.id=nn.sid and nn.dist < 2000;""")
    # results
    cols = ("organisation_id, site_id, test_type_id, date_collected, time_collected, organisation_collecting, "
            "result, result_qualifier, condition, observed_weather, other_observations, source, source_ref")
    vals = []
    for (site, tt, date, tm, org, q, v, cond, weather, obs, src, ref) in results:
        vals.append(
            f"('{ORG}',(select id from test_sites where organisation_id='{ORG}' and name={lit(site)} limit 1),"
            f"(select id from test_types where organisation_id='{ORG}' and test_name={lit(tt)} limit 1),"
            f"{lit(date)},{lit(tm)},'South West Water',{v},{lit(q)},{lit(cond)},{lit(weather)},{lit(obs)},{lit(src)},{lit(ref)})"
        )
    for i in range(0, len(vals), 200):
        out.append(f"insert into test_results ({cols}) values\n  " + ",\n  ".join(vals[i:i+200])
                   + "\non conflict (source_ref) do update set result=excluded.result, result_qualifier=excluded.result_qualifier, "
                     "condition=excluded.condition, observed_weather=excluded.observed_weather, other_observations=excluded.other_observations;")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
