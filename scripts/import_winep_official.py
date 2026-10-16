#!/usr/bin/env python3
"""
Load the FULL official EA PR24 WINEP National Dataset (every driver), filtered to this catchment.

Supersedes the two partial loaders: import_winep.py reads the Rivers Trust geocoded mirror, which
drops BW_* actions AND the Environment-Act storm-overflow improvement actions; import_winep_bw.py
backfills only the BW_* rows. This reads the EA's authoritative .xlsx (the definitive WINEP source,
https://www.data.gov.uk/dataset -> "PR24 WINEP National Dataset.xlsx") and keeps this water company's
PR24 actions that scope to the catchment (water body / works / outlet proximity).

Reuses import_winep.emit() so the SQL is identical: temp table -> resolve our water_body/system/asset
ids -> keep rows scoping to the catchment -> upsert on the natural key (ids preserved so
winep_asset_links survive) -> source-scoped stale-delete. Source tag 'winep_pr24_official'.

Usage:
  python3 import_winep_official.py --config config/catchments/dart.json \
      "~/Downloads/PR24 WINEP National Dataset.xlsx" > dart_winep.sql
  python3 run_sql.py dart_winep.sql           # against the matching instance DB

Note: once verified, this replaces import_winep.py + import_winep_bw.py for PR24 (one source of truth).
"""
import datetime, os, sys
from openpyxl import load_workbook
import catchment_config
from import_winep import works_key, q, MATCH_DIST_M
from import_winep_bw import osgb_to_wgs84

SHEET = "PR24 WINEP National Data"


def emit(rows, org, cfg, cycle="PR24"):
    """Same shape as import_winep.emit(), but resolves asset_id by EXACT Action_Name == asset_name
    first (the official storm-overflow improvement actions carry no geometry, only the outlet name),
    then falls back to nearest outlet within MATCH_DIST_M. Upsert on the natural key (ids preserved so
    winep_asset_links survive) + a source-scoped stale-delete."""
    orgl = q(org) + "::uuid"
    cols = ("cycle text, action_id text, comp text, company text, dcode text, dlabel text, "
            "doblig text, dsec text, dter text, name text, descr text, tier1 text, opt text, "
            "aim text, scale text, ea_wb text, wb_type text, wb_name text, due date, bw text, "
            "sw text, sssi text, sac text, mcz text, cdwf text, pdwf text, cbod text, pbod text, "
            "cnh3 text, pnh3 text, cp text, pp text, wkey text, lon float, lat float, source text")
    out = [f"-- River Hub: FULL official PR24 WINEP for {cfg['river']} (all drivers). Idempotent:\n"
           "-- natural-key upsert (ids preserved so winep_asset_links survive) + source-scoped stale-delete.",
           "begin;",
           f"create temp table _w({cols}) on commit drop;"]
    for r in rows:
        out.append("insert into _w values (" + ",".join([
            q(cycle), q(r["action_id"]), q(r["comp"]), q(r["company"]), q(r["dcode"]), q(r["dlabel"]),
            q(r["doblig"]), q(r["dsec"]), q(r["dter"]), q(r["name"]), q(r["desc"]), q(r["tier1"]),
            q(r["opt"]), q(r["aim"]), q(r["scale"]), q(r["ea_wb"]), q(r["wb_type"]), q(r["wb_name"]),
            q(r["due"]), q(r["bw"]), q(r["sw"]), q(r["sssi"]), q(r["sac"]), q(r["mcz"]), q(r["cdwf"]),
            q(r["pdwf"]), q(r["cbod"]), q(r["pbod"]), q(r["cnh3"]), q(r["pnh3"]), q(r["cp"]), q(r["pp"]),
            q(r["wkey"]),
            "null" if r["lon"] is None else repr(r["lon"]),
            "null" if r["lat"] is None else repr(r["lat"]), q(r["source"]),
        ]) + ");")

    out.append(f"""create temp table _wm on commit drop as
select w.*,
  (select wb.id from water_bodies wb
     where wb.organisation_id = {orgl} and wb.ea_water_body_id = w.ea_wb limit 1) as water_body_id,
  (select sy.id from sewage_systems sy
     where sy.organisation_id = {orgl} and w.wkey is not null
       and lower(split_part(sy.name, ' system', 1)) = w.wkey limit 1) as system_id,
  coalesce(
    (select sa.id from sewage_assets sa
       where sa.organisation_id = {orgl} and w.name is not null
         and upper(btrim(sa.asset_name)) = upper(btrim(w.name)) limit 1),
    (select sa.id from sewage_assets sa
       where sa.organisation_id = {orgl} and sa.latitude is not null and sa.longitude is not null
         and w.lon is not null
         and ST_DWithin(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude),4326)::geography,
                        ST_SetSRID(ST_MakePoint(w.lon, w.lat),4326)::geography, {MATCH_DIST_M})
       order by ST_Distance(ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude),4326)::geography,
                            ST_SetSRID(ST_MakePoint(w.lon, w.lat),4326)::geography) limit 1)
  ) as asset_id
from _w w;""")

    out.append("select 'resolved by exact asset name or proximity: ' || count(*) from _wm where asset_id is not null;")
    out.append("select 'resolved by works name: ' || count(*) from _wm where system_id is not null;")
    out.append("select 'resolved by water body: ' || count(*) from _wm where water_body_id is not null;")

    _upd = ", ".join(f"{c} = excluded.{c}" for c in (
        "water_company", "driver_code", "driver_label", "driver_obligation", "driver_code_secondary",
        "driver_code_tertiary", "action_name", "action_description", "tier1_outcome", "options_outcome",
        "aim", "spatial_scale", "ea_water_body_id", "wb_type", "wb_name", "water_body_id", "asset_id",
        "sewage_system_id", "completion_date", "bathing_water", "shellfish_water", "sssi", "sac_spa_ramsar",
        "mcz", "current_permit_dwf", "proposed_permit_dwf", "current_bod", "proposed_bod", "current_nh3",
        "proposed_nh3", "current_p", "proposed_p", "latitude", "longitude", "source"))
    out.append(f"""insert into winep_actions
  (organisation_id, cycle, action_id, action_component, water_company, driver_code, driver_label,
   driver_obligation, driver_code_secondary, driver_code_tertiary, action_name, action_description,
   tier1_outcome, options_outcome, aim, spatial_scale, ea_water_body_id, wb_type, wb_name,
   water_body_id, asset_id, sewage_system_id, completion_date, bathing_water, shellfish_water, sssi,
   sac_spa_ramsar, mcz, current_permit_dwf, proposed_permit_dwf, current_bod, proposed_bod,
   current_nh3, proposed_nh3, current_p, proposed_p, latitude, longitude, source)
  select distinct on (cycle, action_id, coalesce(comp,''))
    {orgl}, cycle, action_id, coalesce(comp,''), company, dcode, dlabel, doblig, dsec, dter, name, descr, tier1,
    opt, aim, scale, ea_wb, wb_type, wb_name, water_body_id, asset_id, system_id, due, bw, sw, sssi,
    sac, mcz, cdwf, pdwf, cbod, pbod, cnh3, pnh3, cp, pp, lat, lon, source
  from _wm
  where water_body_id is not null or system_id is not null or asset_id is not null
  order by cycle, action_id, coalesce(comp,'')
  on conflict (organisation_id, cycle, action_id, action_component) do update set {_upd};""")
    out.append(f"""delete from winep_actions wa
  where wa.organisation_id = {orgl} and wa.cycle = {q(cycle)}
    and wa.source in (select distinct source from _wm)
    and not exists (
      select 1 from _wm m
      where m.action_id = wa.action_id and coalesce(m.comp,'') = wa.action_component
        and (m.water_body_id is not null or m.system_id is not null or m.asset_id is not null));""")
    out.append(f"select 'kept (in catchment): ' || count(*) from _wm "
               "where water_body_id is not null or system_id is not null or asset_id is not null;")
    out.append(f"select 'winep_actions now (PR24): ' || count(*) from winep_actions "
               f"where organisation_id = {orgl} and cycle = 'PR24';")
    out.append("commit;")
    print("\n".join(out))


def as_date(v):
    if v in (None, ""):
        return None
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    s = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def _cfg_arg():
    a = sys.argv
    for i, v in enumerate(a):
        if v == "--config" and i + 1 < len(a):
            return a[i + 1]
    return None


def _drivers():
    """code -> (obligation, label) from the EA DriverCodes lookup; empty if offline (obligation then
    falls back to the row's own Obligation column)."""
    try:
        from import_winep import driver_map
        return driver_map()
    except Exception as e:
        print(f"-- WARN driver lookup unavailable ({e}); using row Obligation only", file=sys.stderr)
        return {}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a != _cfg_arg()]
    if not args:
        sys.exit("give the path to the official PR24 WINEP National Dataset .xlsx")
    cfg = catchment_config.load()
    org = cfg["org_id"]
    s, w, north, e = cfg["geo"]["bbox"]                       # [south, west, north, east]
    wbids = set(cfg.get("wfd", {}).get("wb_ids", []))
    company = cfg["company"].get("annual_sheet_match", cfg["company"]["name"])
    dmap = _drivers()

    wb = load_workbook(os.path.expanduser(args[0]), read_only=True, data_only=True)
    if SHEET not in wb.sheetnames:
        sys.exit(f"sheet '{SHEET}' not found; sheets = {wb.sheetnames}")
    it = wb[SHEET].iter_rows(values_only=True)
    hdr = [str(c).strip() if c is not None else "" for c in next(it)]
    idx = {h: i for i, h in enumerate(hdr)}

    def g(r, h):
        i = idx.get(h)
        return r[i] if i is not None and i < len(r) else None

    def t(r, h):                      # trimmed string or None
        v = g(r, h)
        return str(v).strip() or None if v not in (None, "") else None

    rows, kept = [], 0
    for r in it:
        if company.upper() not in str(g(r, "Water_Company") or "").upper():
            continue
        aid = (str(g(r, "Action_ID") or "").strip())
        if not aid:
            continue
        lat, lon = osgb_to_wgs84(g(r, "Easting"), g(r, "Northing"))
        eawb = t(r, "Waterbody_ID")
        inbox = lat is not None and s <= lat <= north and w <= lon <= e
        # Keep: geocoded-in-catchment, water-body-matched, OR ungeocoded (name-only actions — the
        # storm-overflow improvements carry no coordinates). The SQL then scopes by exact Action_Name
        # == asset_name, works name, or water body, so only this catchment's rows are kept.
        if not (inbox or (eawb in wbids) or lat is None):
            continue
        kept += 1
        dcode = t(r, "Driver_Code_Primary")
        doblig, dlabel = dmap.get(dcode, (None, None))
        if doblig is None:
            doblig = t(r, "Obligation")
        name = t(r, "Action_Name")
        rows.append({
            "cycle": "PR24", "action_id": aid, "comp": (str(g(r, "Action_Component") or "").strip()),
            "company": t(r, "Water_Company"),
            "dcode": dcode, "dlabel": dlabel, "doblig": doblig,
            "dsec": t(r, "Driver_Code_Secondary"), "dter": t(r, "Driver_Code_Tertiary"),
            "name": name, "desc": t(r, "Action_Description"),
            "tier1": t(r, "Tier_1_Outcome"), "opt": t(r, "Options_Assessment_Outcome"),
            "aim": t(r, "Action_Categorisation_Aim"), "scale": t(r, "Spatial_Scale_of_Action_Delivery"),
            "ea_wb": eawb, "wb_type": t(r, "Waterbody_Type"),
            "wb_name": t(r, "Name_of_Boundary_within_which_Action_is_being_implemented"),
            "due": as_date(g(r, "Completion_Date")),
            "bw": t(r, "PRIMARY:Name_of_Bathing_Water"), "sw": t(r, "PRIMARY:Name_of_Shellfish_Water"),
            "sssi": t(r, "PRIMARY:Name_of_SSSI"), "sac": t(r, "PRIMARY:Name_of_European_Site(SAC/SPA/RAMSAR)"),
            "mcz": t(r, "Name_of_MCZ"),
            "cdwf": t(r, "Current_Permit_DWF_(m3/d)_(or_Ml/d_for_UU)"),
            "pdwf": t(r, "Proposed_Permit_DWF_(m3/d)_(or_Ml/d_for_UU)"),
            "cbod": t(r, "Current_BOD_Permit_limit_(mg/l)"),
            "pbod": t(r, "Proposed_BOD_permit_95%ile(mg/l)(S=Summer;W=Winter)_plus_Upper_Tiers_where_applicable"),
            "cnh3": t(r, "Current_NH3_Permit_limit_(mg/l)"),
            "pnh3": t(r, "Proposed_NH3_permit_95%ile(mg/l)(S=Summer;W=Winter)_plus_Upper_Tiers_where_applicable"),
            "cp": t(r, "Current_P_Permit_limit_(mg/l)"),
            "pp": t(r, "Proposed_P_annual_average_permit_mg/l_(S=summer)/backstop_limit(mg/l)"),
            "wkey": works_key(name or ""),
            "lon": lon, "lat": lat, "source": "winep_pr24_official",
        })

    print(f"-- {kept} {company} PR24 WINEP rows pre-filtered to the {cfg['river']} catchment "
          f"({len(dmap)} driver codes decoded)", file=sys.stderr)
    if not rows:
        sys.exit("no WINEP rows matched — check the company name / bbox / wb_ids in the config")
    emit(rows, org, cfg, "PR24")


if __name__ == "__main__":
    main()
