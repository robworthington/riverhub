#!/usr/bin/env python3
"""
Import the bathing-water WINEP actions the Rivers Trust mirror omits.

The main import_winep.py sources PR24 from the Rivers Trust geocoded FeatureServer, which only carries
actions tagged to a river water body. Bathing-water-driven actions (BW_* drivers) are pinned to the
bathing water by grid reference and carry a BLANK Waterbody_ID, so the mirror drops them entirely —
e.g. the Kilbury UV commitment on the Dart. This loads them from the OFFICIAL EA PR24 WINEP National
Dataset (.xlsx) instead.

UPSERT ONLY — never deletes. (import_winep.py's delete-all-then-insert would cascade winep_asset_links
away; this one preserves existing actions, their ids, and their asset links.) Source tag
'winep_pr24_official_bw'. Auto-links actions whose Action_Name exactly matches a sewage_asset.

Usage:
  python3 import_winep_bw.py --config ../config/catchments/dart.json /tmp/pr24_winep.xlsx > /tmp/dart_bw.sql
Scope: an action is kept if its grid ref falls in the catchment bbox OR its Action_Name matches one of
the org's sewage_assets (so blank-grid named actions like KILBURY STW_SO_BUCKFASTLEIGH are caught).
"""
import math, sys
from openpyxl import load_workbook
import catchment_config

# EA DriverCodes descriptions for the BW_ family (from the DriverCodes service; hardcoded so the
# importer needs no network). Obligation theme is "Bathing Waters" for all.
BW_LABELS = {
    "BW_IMP1": "Actions to improve waters with a current planning class of Poor.",
    "BW_IMP2": "Actions to improve waters at risk of deterioration to a planning class.",
    "BW_IMP3": "Actions to improve waters to Good or Excellent where there is evidence.",
    "BW_IMP4": "Actions to improve non-designated waters where there is evidence.",
    "BW_INV1": "Investigations for waters with a current planning class of Poor.",
    "BW_INV2": "Investigations for waters at risk of deterioration to a planning class.",
    "BW_INV3": "Investigations to lead to improving waters to Good or Excellent.",
    "BW_INV5": "Investigations at non-designated waters where there is evidence.",
    "BW_ND": "Actions to improve waters failing their Baseline class.",
    "BW_NDINV": "Investigations for waters failing their Baseline class.",
}


def osgb_to_wgs84(E, N):
    """OSGB National Grid easting/northing -> approx WGS84 lat/lon (OSGB36 lat/lon; the ~100 m datum
    shift is immaterial for a catchment bbox test). Standard OS inverse Transverse Mercator on Airy 1830."""
    try:
        E, N = float(E), float(N)
    except (TypeError, ValueError):
        return None, None
    a, b = 6377563.396, 6356256.909
    F0 = 0.9996012717
    lat0, lon0 = math.radians(49), math.radians(-2)
    N0, E0 = -100000.0, 400000.0
    e2 = 1 - (b * b) / (a * a)
    n = (a - b) / (a + b)
    lat = lat0
    M = 0.0
    while True:
        lat = (N - N0 - M) / (a * F0) + lat
        Ma = (1 + n + 1.25 * n**2 + 1.25 * n**3) * (lat - lat0)
        Mb = (3 * n + 3 * n**2 + 2.625 * n**3) * math.sin(lat - lat0) * math.cos(lat + lat0)
        Mc = (1.875 * n**2 + 1.875 * n**3) * math.sin(2 * (lat - lat0)) * math.cos(2 * (lat + lat0))
        Md = (35 / 24) * n**3 * math.sin(3 * (lat - lat0)) * math.cos(3 * (lat + lat0))
        M = b * F0 * (Ma - Mb + Mc - Md)
        if abs(N - N0 - M) < 0.00001:
            break
    sinlat = math.sin(lat)
    nu = a * F0 / math.sqrt(1 - e2 * sinlat**2)
    rho = a * F0 * (1 - e2) / (1 - e2 * sinlat**2) ** 1.5
    eta2 = nu / rho - 1
    tanlat = math.tan(lat)
    sec = 1 / math.cos(lat)
    VII = tanlat / (2 * rho * nu)
    VIII = tanlat / (24 * rho * nu**3) * (5 + 3 * tanlat**2 + eta2 - 9 * tanlat**2 * eta2)
    IX = tanlat / (720 * rho * nu**5) * (61 + 90 * tanlat**2 + 45 * tanlat**4)
    X = sec / nu
    XI = sec / (6 * nu**3) * (nu / rho + 2 * tanlat**2)
    XII = sec / (120 * nu**5) * (5 + 28 * tanlat**2 + 24 * tanlat**4)
    dE = E - E0
    latr = lat - VII * dE**2 + VIII * dE**4 - IX * dE**6
    lonr = lon0 + X * dE - XI * dE**3 + XII * dE**5
    return math.degrees(latr), math.degrees(lonr)


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def numlit(v):
    try:
        return repr(float(v))
    except (TypeError, ValueError):
        return "null"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a != _cfg_arg()]
    if not args:
        sys.exit("give the path to the official PR24 WINEP National Dataset .xlsx")
    cfg = catchment_config.load()
    org = cfg["org_id"]
    s, w, north, e = cfg["geo"]["bbox"]  # [south, west, north, east]
    company = cfg["company"].get("annual_sheet_match", "South West Water")

    wb = load_workbook(args[0], read_only=True, data_only=True)
    ws = wb["PR24 WINEP National Data"]
    rows = ws.iter_rows(values_only=True)
    hdr = [str(c).strip() if c is not None else "" for c in next(rows)]
    idx = {h: i for i, h in enumerate(hdr)}

    def g(r, h):
        i = idx.get(h)
        return r[i] if i is not None and i < len(r) else None

    recs = []
    for r in rows:
        if company.upper() not in str(g(r, "Water_Company") or "").upper():
            continue
        drv = str(g(r, "Driver_Code_Primary") or "")
        if not drv.startswith("BW_"):
            continue
        lat, lon = osgb_to_wgs84(g(r, "Easting"), g(r, "Northing"))
        # pre-filter to keep the SQL small: stage a grid-referenced action only if it's in the config
        # bbox (the DB then applies the tight 2km-or-name scope); blank-grid actions are always staged
        # so their name-match runs in the DB.
        if lat is not None and not (s <= lat <= north and w <= lon <= e):
            continue
        recs.append({
            "action_id": str(g(r, "Action_ID") or ""),
            "comp": str(g(r, "Action_Component") or ""),
            "drv": drv, "dsec": g(r, "Driver_Code_Secondary"), "dter": g(r, "Driver_Code_Tertiary"),
            "label": BW_LABELS.get(drv, drv), "name": g(r, "Action_Name"),
            "descr": g(r, "Action_Description"), "due": (str(g(r, "Completion_Date") or "")[:10] or None),
            "tier1": g(r, "Tier_1_Outcome"), "lat": lat, "lon": lon,
            # richer "what action is required" detail
            "atype": g(r, "Action_Categorisation_Type"), "aim": g(r, "Action_Categorisation_Aim"),
            "opt": g(r, "Options_Assessment_Outcome"), "scale": g(r, "Spatial_Scale_of_Action_Delivery"),
            "permit": g(r, "Licence_Permit_Obstruction_ID"),
        })
    wb.close()
    print(f"-- {len(recs)} SWW BW_* actions in the official file", file=sys.stderr)

    out = [f"-- Bathing-water WINEP actions for {cfg['river']} from the official EA PR24 file. Upsert only.",
           "begin;",
           "create temp table _bw(action_id text, comp text, drv text, dsec text, dter text, label text,"
           " name text, descr text, due date, tier1 text, lat float8, lon float8,"
           " atype text, aim text, opt text, scale text, permit text) on commit drop;"]
    for x in recs:
        out.append("insert into _bw values (" + ",".join([
            q(x["action_id"]), q(x["comp"]), q(x["drv"]), q(x["dsec"]), q(x["dter"]), q(x["label"]),
            q(x["name"]), q(x["descr"]), q(x["due"]), q(x["tier1"]), numlit(x["lat"]), numlit(x["lon"]),
            q(x["atype"]), q(x["aim"]), q(x["opt"]), q(x["scale"]), q(x["permit"]),
        ]) + ");")
    orgl = q(org) + "::uuid"
    # keep an action if it falls in the bbox OR names one of the org's assets (catches blank-grid named actions)
    out.append(f"""insert into winep_actions
  (organisation_id, cycle, action_id, action_component, water_company, driver_code, driver_label,
   driver_obligation, driver_code_secondary, driver_code_tertiary, action_name, action_description,
   tier1_outcome, completion_date, latitude, longitude,
   action_type, aim, options_outcome, spatial_scale, permit_ref, source)
  select {orgl}, 'PR24', x.action_id, x.comp, {q(company)}, x.drv, x.label, 'Bathing Waters',
         x.dsec, x.dter, x.name, x.descr, x.tier1, x.due, x.lat, x.lon,
         x.atype, x.aim, x.opt, x.scale, x.permit, 'winep_pr24_official_bw'
  from _bw x
  -- keep only actions that resolve to THIS catchment: name an org asset, or sit within 2 km of one
  -- (the rectangular bbox over-captures neighbouring catchments — Paignton, Erme, Avon — so proximity
  --  to a real asset is the reliable scope, mirroring import_winep.py's asset-match approach).
  where exists (select 1 from sewage_assets a where a.organisation_id = {orgl} and a.asset_name = x.name)
     or (x.lat is not null and exists (
           select 1 from sewage_assets a
           where a.organisation_id = {orgl} and a.latitude is not null and a.longitude is not null
             and ST_DWithin(ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography, 2000)))
  on conflict (organisation_id, cycle, action_id, action_component) do update set
    driver_code = excluded.driver_code, driver_label = excluded.driver_label,
    action_name = excluded.action_name, action_description = excluded.action_description,
    completion_date = excluded.completion_date, latitude = excluded.latitude, longitude = excluded.longitude,
    action_type = excluded.action_type, aim = excluded.aim, options_outcome = excluded.options_outcome,
    spatial_scale = excluded.spatial_scale, permit_ref = excluded.permit_ref, source = excluded.source;""")
    # auto-link actions whose name exactly matches an asset
    out.append(f"""insert into winep_asset_links (organisation_id, winep_action_id, asset_id, note)
  select {orgl}, wction.id, a.id, 'auto: official BW action names this overflow'
  from winep_actions wction
  join sewage_assets a on a.organisation_id = {orgl} and a.asset_name = wction.action_name
  where wction.organisation_id = {orgl} and wction.source = 'winep_pr24_official_bw'
  on conflict (winep_action_id, asset_id) do nothing;""")
    out.append(f"select 'BW actions loaded: ' || count(*) from winep_actions where organisation_id = {orgl} and source = 'winep_pr24_official_bw';")
    out.append(f"""select wction.action_name, count(l.id) as links
  from winep_actions wction left join winep_asset_links l on l.winep_action_id = wction.id
  where wction.organisation_id = {orgl} and wction.source = 'winep_pr24_official_bw'
  group by wction.action_name order by wction.action_name;""")
    out.append("commit;")
    print("\n".join(out))


def _cfg_arg():
    a = sys.argv
    for i, v in enumerate(a):
        if v == "--config" and i + 1 < len(a):
            return a[i + 1]
    return None


if __name__ == "__main__":
    main()
