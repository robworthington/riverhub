#!/usr/bin/env python3
"""Audit WINEP completeness: prove the import covers EVERY in-scope measure for a catchment.

The importer's own review log (winep_import_log) only sees rows that were *staged* — it is blind to
anything dropped by the config bbox / water-body list before staging. This script recomputes what is
in-scope INDEPENDENTLY, straight from the DB (the catchment's water bodies, works and assets), with
no bbox clip, and diffs that against what actually landed in winep_actions. A clean run means every
measure that ties to one of your water bodies, works or outlets is present; anything else is listed.

    export DATABASE_URL='<Dart or Teign session-pooler URL>'
    python3 winep_audit.py --config config/catchments/dart.json "~/Downloads/PR24 WINEP National Dataset.xlsx"

Read-only on the DB. Reports:
  1. GAPS          — rows that scope to us (water body / works name / <=150m to an outlet) but are
                     NOT in winep_actions. This should be empty. bbox-clipped rows show up here.
  2. MISSING WBs   — Waterbody_IDs that our own assets/works actions carry but that are NOT in the
                     configured water-body list (a catchment water body you haven't loaded).
  3. UNATTRIBUTABLE— SWW actions with no water body, no geometry, and a name matching none of our
                     works: cannot be tied to the catchment from data alone (EA naming reconciliation
                     only). The irreducible ceiling on provable completeness — eyeball these.
"""
import os, sys, math
url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts"))
import catchment_config
from import_winep import osgb_to_wgs84, works_key
from openpyxl import load_workbook
import psycopg2

PROX_M = 150  # mirror the importer's outlet-proximity limb
SHEET = "PR24 WINEP National Data"


def _cfg_arg():
    for i, v in enumerate(sys.argv):
        if v == "--config" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def haversine_m(a_lat, a_lon, b_lat, b_lon):
    R = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a != _cfg_arg()]
    if not args:
        sys.exit("give the path to the official PR24 WINEP National Dataset .xlsx")
    cfg = catchment_config.load()
    s, w, north, e = cfg["geo"]["bbox"]
    company = cfg["company"].get("annual_sheet_match", cfg["company"]["name"])

    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("select public_org from app_config limit 1")
    org = cur.fetchone()[0]

    # --- ground truth from the DB (independent of config bbox) ---
    cur.execute("select ea_water_body_id from water_bodies where organisation_id=%s and ea_water_body_id is not null", (org,))
    hub_wbids = {r[0] for r in cur.fetchall()}
    cur.execute("select upper(btrim(asset_name)) from sewage_assets where organisation_id=%s and asset_name is not null", (org,))
    asset_names = {r[0] for r in cur.fetchall()}
    cur.execute("select lower(split_part(name,' system',1)) from sewage_systems where organisation_id=%s", (org,))
    sys_keys = {r[0] for r in cur.fetchall() if r[0]}
    cur.execute("""select latitude, longitude from sewage_assets
                   where organisation_id=%s and latitude is not null and longitude is not null""", (org,))
    assets = cur.fetchall()
    cur.execute("""select latitude, longitude, asset_name from sewage_assets
                   where organisation_id=%s and latitude is not null and longitude is not null""", (org,))
    asset_pts = cur.fetchall()
    # imported set (PR24) — natural key (action_id, action_component)
    cur.execute("""select action_id, coalesce(action_component,'') from winep_actions
                   where organisation_id=%s and cycle='PR24'""", (org,))
    imported = {(a, c) for a, c in cur.fetchall()}

    # asset bbox — does the config bbox actually contain every asset? (clipping check)
    lats = [a[0] for a in assets]; lons = [a[1] for a in assets]
    outside = [a for a in asset_pts if not (s <= a[0] <= north and w <= a[1] <= e)]

    # --- read the file, classify every SWW row independently ---
    wb = load_workbook(os.path.expanduser(args[0]), read_only=True, data_only=True)
    it = wb[SHEET].iter_rows(values_only=True)
    hdr = [str(c).strip() if c is not None else "" for c in next(it)]
    idx = {h: i for i, h in enumerate(hdr)}

    def g(r, h):
        i = idx.get(h)
        return r[i] if i is not None and i < len(r) else None

    candidates, gaps, missing_wbs, unattributable = [], [], {}, 0
    sww_rows = 0
    for r in it:
        if company.upper() not in str(g(r, "Water_Company") or "").upper():
            continue
        aid = str(g(r, "Action_ID") or "").strip()
        if not aid:
            continue
        sww_rows += 1
        comp = str(g(r, "Action_Component") or "").strip()
        name = (str(g(r, "Action_Name")).strip() if g(r, "Action_Name") else None)
        wbid = (str(g(r, "Waterbody_ID")).strip() or None) if g(r, "Waterbody_ID") else None
        lat, lon = osgb_to_wgs84(g(r, "Easting"), g(r, "Northing"))
        dcode = str(g(r, "Driver_Code_Primary") or "").strip()

        by_wb = wbid in hub_wbids if wbid else False
        by_name = bool(name) and (name.upper() in asset_names or works_key(name) in sys_keys)
        by_prox = False
        if lat is not None:
            by_prox = any(haversine_m(lat, lon, a[0], a[1]) <= PROX_M for a in assets)

        if by_wb or by_name or by_prox:
            limbs = ",".join(k for k, v in (("wb", by_wb), ("name", by_name), ("prox", by_prox)) if v)
            candidates.append((aid, comp, name, dcode, limbs))
            # a water body our own actions touch but that isn't in the configured list → missing WB
            if (by_name or by_prox) and wbid and wbid not in hub_wbids:
                missing_wbs.setdefault(wbid, []).append(name or aid)
            if (aid, comp) not in imported:
                gaps.append((aid, comp, name, dcode, limbs))
        elif not wbid and lat is None:
            # no water body, no geometry, name matches nothing we hold — cannot attribute from data
            unattributable += 1

    # --- report ---
    print(f"org {org} | company '{company}'")
    print(f"SWW actions in file: {sww_rows} | in-scope candidates (wb/name/prox): {len(candidates)} "
          f"| imported (PR24): {len(imported)}")
    print(f"\n1. GAPS — in scope but NOT imported: {len(gaps)}  (expect 0)")
    for aid, comp, name, dcode, limbs in sorted(gaps, key=lambda x: (x[3], x[2] or "")):
        print(f"   [{dcode:<12}] {(name or '(no name)')[:48]:<48} via {limbs:<12} {aid}{('/'+comp) if comp else ''}")

    print(f"\n2. MISSING WATER BODIES — our actions carry these Waterbody_IDs, not in config wb_ids: {len(missing_wbs)}")
    for wbid, names in missing_wbs.items():
        print(f"   {wbid}  e.g. {names[0]}  (+{len(names)-1} more)" if len(names) > 1 else f"   {wbid}  {names[0]}")

    print(f"\n3. BBOX CLIPPING — assets outside the config bbox (geocoded file rows near them get dropped): {len(outside)}")
    for la, lo, nm in outside[:20]:
        print(f"   {nm}  ({la:.4f},{lo:.4f})")
    if lats:
        print(f"   asset extent lat[{min(lats):.3f},{max(lats):.3f}] lon[{min(lons):.3f},{max(lons):.3f}] "
              f"vs bbox lat[{s},{north}] lon[{w},{e}]")

    print(f"\n4. UNATTRIBUTABLE RESIDUE — SWW actions with no water body, no geometry, name matching none "
          f"of our works: {unattributable}")
    print("   (These cannot be tied to the catchment from data alone — EA naming reconciliation only.)")
    conn.close()
    sys.exit(1 if gaps else 0)


if __name__ == "__main__":
    main()
