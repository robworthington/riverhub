#!/usr/bin/env python3
"""
Onboard a whole water company's rivers (ENGLAND-ROLLOUT-PLAN.md Phase 0.4, NATIONAL-ONBOARDING.md §7).

Three commands, run in order, with a human review of the sheet between `plan` and `configs`:

  plan     List the river operational catchments in the given river basin district(s) that hold the
           company's overflows, and write a review sheet (CSV) with a proposed name and slug for each.
             onboard_company.py plan --company wessex --rbd "South West" --rbd Severn \
                 [--check-company sww] [--min-outlets 3] --out batches/wessex.csv

  configs  For every row marked approve=yes, generate config/catchments/<slug>.json (fresh org uuid),
           then give each estuary to one river only (shared estuaries would credit the same outlets to
           two rivers). Writes the org uuids and estuary notes back into the sheet.
             onboard_company.py configs --sheet batches/wessex.csv

  seed     Print the SQL that inserts the approved rivers' organisation rows, hidden (live=false).
             onboard_company.py seed --sheet batches/wessex.csv > /tmp/seed.sql

Then load them with run_batch.py. Run with /usr/bin/python3 (system TLS; see the runbook's TLS note).

How a catchment is assigned: each live-feed outlet is placed in the river opcat polygon that contains it
(estuary/coastal "TraC" opcats are excluded, so estuary outlets fall to whichever river opcat holds
them or to none). A catchment belongs to the company that has most outlets in it; any other company
with outlets there is listed as an extra company (a two-company catchment, runbook §1b). Catchments
already covered by a committed config are marked and skipped.
"""
import argparse
import csv
import glob
import json
import os
import re
import subprocess
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_catchment_config import COMPANIES, OPCAT, _get  # noqa: E402

CONFIG_DIR = os.path.join(HERE, "..", "config", "catchments")
SHEET_FIELDS = ["approve", "opcat_id", "opcat_name", "management_catchment", "rbd", "outlets",
                "other_companies", "river_name", "slug", "org_id", "notes"]


# ---------------------------------------------------------------- data

def feed_outlets(feed_url):
    """[(id, lat, lng)] for every outlet in a company's live feed (whole feed, paged)."""
    layer = re.sub(r"/query/?$", "", feed_url)
    meta = _get(layer, {"f": "json"})
    page = min(meta.get("maxRecordCount") or 1000, 2000)
    oid = meta.get("objectIdField")
    out, offset = [], 0
    for _ in range(20):
        params = {"where": "1=1", "outFields": "*", "returnGeometry": "false",
                  "resultOffset": offset, "resultRecordCount": page, "f": "json"}
        if oid:
            params["orderByFields"] = oid
        d = _get(layer + "/query", params)
        feats = d.get("features", [])
        for f in feats:
            a = {k.lower(): v for k, v in f["attributes"].items()}
            if a.get("latitude") is not None and a.get("longitude") is not None:
                out.append((a.get("id"), float(a["latitude"]), float(a["longitude"])))
        offset += len(feats)
        if not d.get("exceededTransferLimit") or not feats:
            break
    return out


def rbd_opcats(rbd):
    """River (non-TraC) operational catchments in a river basin district, with WGS84 rings."""
    out, offset = [], 0
    while True:
        d = _get(OPCAT, {"where": f"rbd_name = '{rbd}' and mncat_name not like '%TraC'",
                         "outFields": "opcat_id,opcat_name,mncat_name,rbd_name", "returnGeometry": "true",
                         "outSR": "4326", "maxAllowableOffset": "0.0002",
                         "resultOffset": offset, "resultRecordCount": 200, "f": "json"})
        feats = d.get("features", [])
        for f in feats:
            rings = (f.get("geometry") or {}).get("rings") or []
            if rings:
                xs = [p[0] for r in rings for p in r]
                ys = [p[1] for r in rings for p in r]
                out.append({**f["attributes"], "rings": rings, "bbox": (min(xs), min(ys), max(xs), max(ys))})
        offset += len(feats)
        if not d.get("exceededTransferLimit") or not feats:
            break
    return out


def inside(lng, lat, rings):
    """Even-odd point-in-polygon over all rings (outer rings and holes)."""
    hit = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
                hit = not hit
            j = i
    return hit


def locate(points, opcats):
    """{opcat_id: count} of points inside each opcat."""
    counts = {}
    for _id, lat, lng in points:
        for o in opcats:
            x0, y0, x1, y1 = o["bbox"]
            if x0 <= lng <= x1 and y0 <= lat <= y1 and inside(lng, lat, o["rings"]):
                counts[o["opcat_id"]] = counts.get(o["opcat_id"], 0) + 1
                break
    return counts


def committed_configs():
    """{opcat_id: slug} for catchments that already have a config, plus every slug in use."""
    by_opcat, slugs = {}, set()
    for path in glob.glob(os.path.join(CONFIG_DIR, "*.json")):
        slug = os.path.splitext(os.path.basename(path))[0]
        slugs.add(slug)
        try:
            prov = json.load(open(path)).get("provenance", "")
        except Exception:
            continue
        m = re.search(r"opcat (\d+)", prov)
        if m:
            by_opcat[int(m.group(1))] = slug
    return by_opcat, slugs


# ---------------------------------------------------------------- naming

NEEDS_RIVER = re.compile(r"\b(river|brook|stream|water|estuary|canal|drain|levels?|streams|rivers)\b", re.I)
# EA names that describe part of a catchment or an area rather than one river ("Bristol Avon Urban",
# "Lower Severn Vale", "Poole Harbour Rivers"): no "River" prefix, and a person should tidy the name.
AREA_WORDS = re.compile(r"\b(urban|rural|upper|lower|middle|vale|harbour|levels|moors?|coast(al)?|north|south|east|west)\b", re.I)


def propose_name(opcat_name):
    """(river name, note). EA opcat names are mostly a river ("Tone"), sometimes a group
    ("Brue and Axe", "Lower Avon, Little Avon and …") that a person should tidy."""
    name = " ".join(opcat_name.split())
    note = ""
    if re.search(r",| and |&", name) or len(name) > 28:
        note = "check name: EA name covers more than one river"
    elif AREA_WORDS.search(name):
        note = "check name: EA name describes an area or part of a river"
    river = name if (NEEDS_RIVER.search(name) or AREA_WORDS.search(name)) else f"River {name}"
    return river, note


def slugify(river_name):
    s = re.sub(r"^river\s+", "", river_name.lower())
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-and-", "-", s)


# ---------------------------------------------------------------- commands

def cmd_plan(a):
    co = COMPANIES[a.company]
    others = [k for k in (a.check_company or []) if k != a.company]
    print(f"-- {co['name']}: reading live feed …", file=sys.stderr)
    mine = feed_outlets(co["edm_feed"])
    other_pts = {k: feed_outlets(COMPANIES[k]["edm_feed"]) for k in others}
    opcats = []
    for rbd in a.rbd:
        got = rbd_opcats(rbd)
        print(f"-- {rbd}: {len(got)} river operational catchments", file=sys.stderr)
        opcats += got
    print(f"-- placing {len(mine)} {co['name']} outlets …", file=sys.stderr)
    counts = locate(mine, opcats)
    other_counts = {k: locate(pts, opcats) for k, pts in other_pts.items()}
    done, slugs = committed_configs()

    rows = []
    for o in sorted(opcats, key=lambda o: -counts.get(o["opcat_id"], 0)):
        n = counts.get(o["opcat_id"], 0)
        if n < a.min_outlets:
            continue
        rivals = {COMPANIES[k]["name"]: c[o["opcat_id"]] for k, c in other_counts.items() if c.get(o["opcat_id"])}
        river, note = propose_name(o["opcat_name"])
        slug = slugify(river)
        notes = [note] if note else []
        approve = ""
        if o["opcat_id"] in done:
            approve, notes = "done", [f"already onboarded as '{done[o['opcat_id']]}'"]
        elif rivals and max(rivals.values()) > n:
            approve = "skip"
            notes.append(f"majority company is {max(rivals, key=rivals.get)}: onboard it in that company's batch")
        if slug in slugs and approve != "done":
            notes.append(f"slug '{slug}' already used: choose another")
        slugs.add(slug)
        rows.append({
            "approve": approve, "opcat_id": o["opcat_id"], "opcat_name": o["opcat_name"],
            "management_catchment": o["mncat_name"], "rbd": o["rbd_name"], "outlets": n,
            "other_companies": "; ".join(f"{k} ({v})" for k, v in rivals.items()),
            "river_name": river, "slug": slug, "org_id": "", "notes": "; ".join(notes),
        })
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SHEET_FIELDS)
        w.writeheader()
        w.writerows(rows)
    todo = sum(1 for r in rows if not r["approve"])
    print(f"wrote {a.out}: {len(rows)} catchments with ≥{a.min_outlets} {co['name']} outlets "
          f"({todo} to review, {sum(r['approve'] == 'done' for r in rows)} already onboarded, "
          f"{sum(r['approve'] == 'skip' for r in rows)} belong to another company)", file=sys.stderr)
    print(f"Next: review the sheet (names, slugs), set approve=yes on the rows to onboard, then "
          f"`onboard_company.py configs --sheet {a.out} --company {a.company}`", file=sys.stderr)


def read_sheet(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def write_sheet(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SHEET_FIELDS)
        w.writeheader()
        w.writerows(rows)


def company_keys_for(row, primary):
    """Preset keys for the row's extra companies (names listed in other_companies)."""
    names = [re.sub(r"\s*\(\d+\)$", "", x.strip()) for x in (row.get("other_companies") or "").split(";") if x.strip()]
    keys = []
    for n in names:
        k = next((k for k, c in COMPANIES.items() if c["name"] == n), None)
        if k and k != primary:
            keys.append(k)
    return keys


def cmd_configs(a):
    rows = read_sheet(a.sheet)
    approved = [r for r in rows if r["approve"].strip().lower() == "yes"]
    if not approved:
        sys.exit("no rows with approve=yes in the sheet")
    for r in approved:
        if not r["org_id"]:
            r["org_id"] = str(uuid.uuid4())
        cmd = [sys.executable, os.path.join(HERE, "gen_catchment_config.py"), r["opcat_id"], r["slug"], r["org_id"],
               "--river", r["river_name"], "--company", a.company]
        for k in company_keys_for(r, a.company):
            cmd += ["--extra-company", k]
        print(f"-- {r['slug']} …", file=sys.stderr)
        res = subprocess.run(cmd, capture_output=True, text=True)
        sys.stderr.write(res.stderr)
        if res.returncode != 0:
            r["notes"] = (r["notes"] + "; " if r["notes"] else "") + "config generation FAILED"
    write_sheet(a.sheet, rows)

    # One river per estuary. Committed (existing) configs keep theirs; among new rivers sharing an
    # estuary, the one with the most outlets keeps it.
    new = {r["slug"]: r for r in approved}
    owners = {}
    for path in glob.glob(os.path.join(CONFIG_DIR, "*.json")):
        slug = os.path.splitext(os.path.basename(path))[0]
        cfg = json.load(open(path))
        ests = cfg.get("wfd", {}).get("estuary_opcat_ids") or (
            [cfg["wfd"]["estuary_opcat_id"]] if cfg.get("wfd", {}).get("estuary_opcat_id") else [])
        for e in ests:
            owners.setdefault(int(e), []).append(slug)
    for est, slugs_ in owners.items():
        if len(slugs_) < 2:
            continue
        existing = [s for s in slugs_ if s not in new]
        keep = existing[0] if existing else max(slugs_, key=lambda s: int(new[s]["outlets"] or 0))
        for s in slugs_:
            if s == keep or s not in new:
                continue
            path = os.path.join(CONFIG_DIR, f"{s}.json")
            cfg = json.load(open(path))
            w = cfg["wfd"]
            w["estuary_opcat_ids"] = [e for e in (w.get("estuary_opcat_ids") or []) if int(e) != est]
            if w.get("estuary_opcat_id") is not None and int(w["estuary_opcat_id"]) == est:
                del w["estuary_opcat_id"]
            with open(path, "w") as fh:
                fh.write(json.dumps(cfg, indent=2) + "\n")
            note = f"estuary {est} shared with {keep}: given to {keep}"
            new[s]["notes"] = (new[s]["notes"] + "; " if new[s]["notes"] else "") + note
            print(f"-- {s}: {note}", file=sys.stderr)
    write_sheet(a.sheet, rows)
    print(f"wrote {len(approved)} configs; next: `onboard_company.py seed --sheet {a.sheet} --company "
          f"{a.company}` and load with run_batch.py", file=sys.stderr)


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def cmd_seed(a):
    co = COMPANIES[a.company]
    region = a.region or re.sub(r"\s+Water$", "", co["name"])
    rows = [r for r in read_sheet(a.sheet) if r["approve"].strip().lower() == "yes" and r["org_id"]]
    if not rows:
        sys.exit("no approved rows with an org_id: run `configs` first")
    print(f"-- {len(rows)} {co['name']} rivers, hidden until verified (live=false). region = {region!r}")
    print("begin;")
    for r in rows:
        cfg = json.load(open(os.path.join(CONFIG_DIR, f"{r['slug']}.json")))
        lat, lng = cfg["geo"]["centre"]
        print(f"""insert into organisations
  (id, name, slug, river_slug, region, live, river_name, portal_name, company_name, logo_url,
   map_centre_lat, map_centre_lng, map_zoom, capacity_response, edm_feed_url, edm_feed_kind, steward)
values ({q(r['org_id'])}, {q(r['river_name'])}, {q(r['slug'])}, {q(r['slug'])}, {q(region)}, false,
   {q(r['river_name'])}, {q(r['river_name'] + ' Data')}, {q(co['name'])}, null,
   {lat}, {lng}, 12, false, {q(co['edm_feed'])}, 'arcgis_edm', 'river_hub')
on conflict (id) do nothing;""")
    print("commit;")
    print("notify pgrst, 'reload schema';")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--company", required=True, choices=list(COMPANIES))
    p.add_argument("--rbd", action="append", required=True, help="river basin district, e.g. 'South West' (repeatable)")
    p.add_argument("--check-company", action="append", choices=list(COMPANIES),
                   help="another company whose outlets to count, to spot two-company catchments (repeatable)")
    p.add_argument("--min-outlets", type=int, default=1)
    p.add_argument("--out", required=True)
    c = sub.add_parser("configs")
    c.add_argument("--sheet", required=True)
    c.add_argument("--company", required=True, choices=list(COMPANIES))
    s = sub.add_parser("seed")
    s.add_argument("--sheet", required=True)
    s.add_argument("--company", required=True, choices=list(COMPANIES))
    s.add_argument("--region", default=None, help="organisations.region for the batch (default: company short name)")
    a = ap.parse_args()
    {"plan": cmd_plan, "configs": cmd_configs, "seed": cmd_seed}[a.cmd](a)


if __name__ == "__main__":
    main()
