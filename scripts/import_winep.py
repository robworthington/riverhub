#!/usr/bin/env python3
"""
Load WINEP (Water Industry National Environment Programme) actions for a catchment from OFFICIAL EA
data only — the single source of truth.

PR24 (current, AMP8): the EA's authoritative "PR24 WINEP National Dataset.xlsx" (data.gov.uk /
environment.data.gov.uk). Every driver is loaded (not just the geocoded or bathing-water subset),
and the storm-overflow improvement actions (EnvAct_IMP*) — which carry no geometry, only the outlet
name — are kept and linked by exact Action_Name == asset_name. This REPLACES the former Rivers Trust
geocoded FeatureServer mirror (which dropped every ungeocoded action) and the BW-only backfill.

PR19 (previous, AMP7) delivery baseline: the official EA PR19 WINEP spreadsheet, via --pr19-xlsx.
Not geocoded (OS eastings/northings, which we don't convert for PR19), so it links by water-body id
or works name only. Separate cycle, separate natural-key space — untouched by the PR24 pass.

Driver codes decode from a committed EA snapshot (winep_driver_codes.json, see
gen_winep_driver_codes.py) — no live service call at import; falls back to the file's own Obligation
column for any code not in the snapshot.

Idempotent: temp table -> resolve our water_body/system/asset ids -> keep rows scoping to the
catchment -> upsert on the natural key (organisation_id, cycle, action_id, action_component) so ids
and their winep_asset_links survive -> source-scoped stale-delete.

Usage:
  python3 import_winep.py --config config/catchments/dart.json \
      "~/Downloads/PR24 WINEP National Dataset.xlsx" > dart_winep.sql
  python3 import_winep.py --config config/catchments/dart.json --pr19-xlsx /path/WINEP_PR19.xlsx > dart_pr19.sql
  python3 run_sql.py dart_winep.sql           # against the matching instance DB

The xlsx path may instead be given via the WINEP_XLSX env var (used by setup_catchment.py); with
neither a path nor WINEP_XLSX set, the importer prints a skip note and exits 0 (a no-op pipeline step).
Pass --refresh-drivers to regenerate the driver-code snapshot from the EA service first.
"""
import datetime, json, math, os, sys
from openpyxl import load_workbook
import catchment_config

SHEET = "PR24 WINEP National Data"
MATCH_DIST_M = 150  # nearest-asset proximity for an outlet-level asset_id (EA loc is ~1km fuzzed)
DRIVER_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "winep_driver_codes.json")


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def works_key(action_name):
    """Normalise a WINEP actionName to a bare works key matching sewage_systems.name's prefix
    (system names are '<WORKS> system'). Returns None for free-text/catchment-level action names."""
    if not action_name:
        return None
    s = action_name.upper().replace("\n", " ").strip()
    s = s.replace("SEWAGETREATMENT WORKS", "STW").replace("SEWAGE TREATMENT WORKS", "STW")
    # NAME_TYPE_TOWN convention: the works is the segment before the first underscore
    if "_" in s:
        s = s.split("_")[0].strip()
    # drop parentheticals e.g. "LADY MEADOW STW (NK_WIDECOMBE)"
    if "(" in s:
        s = s.split("(")[0].strip()
    # strip the trailing works-type token(s)
    for suf in (" STW", " ST", " WTW", " WRW", " PS", " SPS", " SEWAGE WORKS"):
        if s.endswith(suf):
            s = s[: -len(suf)].strip()
    # reject obvious free-text (no clear single works) — keep only tidy short keys
    if not s or len(s) > 40 or any(t in s for t in ("OBSTRUCTION", "ABSTRACTION", "RIVER ", "ECOLOGICAL", " RES", "MOOR")):
        return None
    return s.lower()


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


def emit(rows, org, cfg, cycle="PR24"):
    """Resolve asset_id by EXACT Action_Name == asset_name first (the official storm-overflow
    improvement actions carry no geometry, only the outlet name), then fall back to nearest outlet
    within MATCH_DIST_M. Upsert on the natural key (ids preserved so winep_asset_links survive) + a
    source-scoped stale-delete."""
    orgl = q(org) + "::uuid"
    # A row is kept (staged into winep_actions) if it resolves to our water body / works / outlet, OR
    # is a candidate worth a manual link (names a works we hold / near one of our outlets). Unlinked
    # candidates land with asset_id null and appear in the admin AssetMeasuresManager picker.
    CAND = ("water_body_id is not null or system_id is not null or asset_id is not null "
            "or names_works or near_asset or matches_bw")
    CAND_M = ("m.water_body_id is not null or m.system_id is not null or m.asset_id is not null "
              "or m.names_works or m.near_asset or m.matches_bw")
    cols = ("cycle text, action_id text, comp text, company text, dcode text, dlabel text, "
            "doblig text, dsec text, dter text, name text, descr text, tier1 text, opt text, "
            "aim text, scale text, ea_wb text, wb_type text, wb_name text, due date, bw text, "
            "sw text, sssi text, sac text, mcz text, cdwf text, pdwf text, cbod text, pbod text, "
            "cnh3 text, pnh3 text, cp text, pp text, wkey text, lon float, lat float, source text")
    out = [f"-- River Hub: official WINEP {cycle} for {cfg['river']} (all drivers). Idempotent:\n"
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
  ) as asset_id,
  -- candidate flags: a row that didn't auto-link but still belongs to (or near) the catchment, so it
  -- is worth staging as an UNLINKED winep_action for an editor to attach in the admin UI. Kept tight
  -- (names a works we hold, OR within 2 km of one of our outlets) so the picker isn't flooded with
  -- the national file.
  (w.name is not null and exists (
     select 1 from sewage_assets a where a.organisation_id = {orgl}
       and upper(split_part(a.asset_name,'_',1)) = upper(split_part(w.name,'_',1)))) as names_works,
  (w.lon is not null and exists (
     select 1 from sewage_assets a
     where a.organisation_id = {orgl} and a.latitude is not null and a.longitude is not null
       and ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude),4326)::geography,
                      ST_SetSRID(ST_MakePoint(w.lon, w.lat),4326)::geography, 2000))) as near_asset,
  -- designated bathing / shellfish water matches one our assets are tagged to. Catches the WINEP
  -- bathing-water improvements that are ungeocoded AND named in the WINEP convention (FORE
  -- STREET_CSO_TOTNES) rather than our human labels (31 Fore Street, Totnes) — so neither name nor
  -- geometry can place them, but the shared bathing water ties them to the catchment precisely.
  (exists (select 1 from sewage_assets a where a.organisation_id = {orgl}
     and ((a.bathing_water is not null and w.bw is not null
            and upper(btrim(a.bathing_water)) = upper(btrim(w.bw)))
       or (a.shellfish_water is not null and w.sw is not null
            and upper(btrim(a.shellfish_water)) = upper(btrim(w.sw)))))) as matches_bw
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
  where {CAND}
  order by cycle, action_id, coalesce(comp,'')
  on conflict (organisation_id, cycle, action_id, action_component) do update set {_upd};""")
    out.append(f"""delete from winep_actions wa
  where wa.organisation_id = {orgl} and wa.cycle = {q(cycle)}
    and wa.source in (select distinct source from _wm)
    and not exists (
      select 1 from _wm m
      where m.action_id = wa.action_id and coalesce(m.comp,'') = wa.action_component
        and {CAND_M});""")
    # ---- Review log: the unlinked candidates now staged for manual linking in the admin UI ----
    # These rows are now IN winep_actions (asset_id null), so they appear in the per-asset
    # AssetMeasuresManager picker for an editor to attach to the right outlet. The log is the per-run
    # worklist: each either names a works we hold (e.g. an SO-vs-SSO outlet mismatch) or sits within
    # 2 km of one of our outlets (a descriptive-named BW action). Non-catchment national rows are
    # correctly excluded.
    out.append("""create table if not exists winep_import_log (
  id               uuid primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  organisation_id  uuid,
  cycle            text,
  source           text,
  action_id        text,
  action_component text,
  action_name      text,
  driver_code      text,
  driver_label     text,
  completion_date  date,
  water_company    text,
  reason           text
);""")
    out.append("create temp table _runts on commit drop as select now() as ts;")
    out.append(f"""insert into winep_import_log
  (run_at, organisation_id, cycle, source, action_id, action_component, action_name,
   driver_code, driver_label, completion_date, water_company, reason)
select (select ts from _runts), {orgl}, m.cycle, m.source, m.action_id, coalesce(m.comp,''), m.name,
       m.dcode, m.dlabel, m.due, m.company,
       case when m.names_works
            then 'awaiting manual link: names a works we hold (attach to the right outlet in the admin UI; e.g. SO vs SSO)'
            when m.near_asset
            then 'awaiting manual link: within 2 km of one of our outlets (check & attach in the admin UI)'
            else 'awaiting manual link: designated bathing/shellfish water matches our assets (attach to the right outlet in the admin UI)'
       end
from _wm m
where m.water_body_id is null and m.system_id is null and m.asset_id is null
  and (m.names_works or m.near_asset or m.matches_bw);""")
    # Verification counts (visible when run via psql; winep_coverage.py reads the log table back).
    out.append("select 'VERIFY staged rows (all company): ' || count(*) from _wm;")
    out.append("select 'VERIFY auto-linked (water body/works/outlet): ' || count(*) from _wm "
               "where water_body_id is not null or system_id is not null or asset_id is not null;")
    out.append(f"""select 'VERIFY routed to admin UI (unlinked candidates): ' || count(*)
  from winep_import_log where organisation_id = {orgl} and run_at = (select ts from _runts);""")
    out.append(f"select 'VERIFY winep_actions kept (linked + candidates): ' || count(*) from _wm where {CAND};")
    out.append(f"select 'winep_actions now ({cycle}): ' || count(*) from winep_actions "
               f"where organisation_id = {orgl} and cycle = {q(cycle)};")
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
            return datetime.datetime.strptime(s.split()[0], fmt).date().isoformat()
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
    """code -> (obligation, label) from the committed EA snapshot (winep_driver_codes.json). Empty if
    the snapshot is missing — the importer then falls back to each row's own Obligation column."""
    if "--refresh-drivers" in sys.argv:
        import subprocess
        gen = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gen_winep_driver_codes.py")
        r = subprocess.run([sys.executable, gen])
        if r.returncode != 0:
            print("-- WARN --refresh-drivers failed; using existing snapshot/Obligation", file=sys.stderr)
    try:
        with open(DRIVER_JSON, encoding="utf-8") as fh:
            raw = json.load(fh)
        return {k: (v.get("obligation"), v.get("label")) for k, v in raw.items()}
    except FileNotFoundError:
        print(f"-- WARN driver snapshot {DRIVER_JSON} not found; run gen_winep_driver_codes.py. "
              "Using row Obligation only.", file=sys.stderr)
        return {}


def _mk_accessors(idx):
    def g(r, h):
        i = idx.get(h)
        return r[i] if i is not None and i < len(r) else None

    def t(r, h):
        v = g(r, h)
        return str(v).strip() or None if v not in (None, "") else None
    return g, t


def build_record(row, idx, dmap):
    """One PR24 WINEP National Dataset row -> the dict emit() expects, or None if it has no Action_ID.
    Shared by the importer and winep_curate.py so curated rows carry identical columns."""
    g, t = _mk_accessors(idx)
    aid = str(g(row, "Action_ID") or "").strip()
    if not aid:
        return None
    lat, lon = osgb_to_wgs84(g(row, "Easting"), g(row, "Northing"))
    eawb = t(row, "Waterbody_ID")
    dcode = t(row, "Driver_Code_Primary")
    doblig, dlabel = dmap.get(dcode, (None, None))
    if doblig is None:
        doblig = t(row, "Obligation")
    name = t(row, "Action_Name")
    return {
        "cycle": "PR24", "action_id": aid, "comp": (str(g(row, "Action_Component") or "").strip()),
        "company": t(row, "Water_Company"),
        "dcode": dcode, "dlabel": dlabel, "doblig": doblig,
        "dsec": t(row, "Driver_Code_Secondary"), "dter": t(row, "Driver_Code_Tertiary"),
        "name": name, "desc": t(row, "Action_Description"),
        "tier1": t(row, "Tier_1_Outcome"), "opt": t(row, "Options_Assessment_Outcome"),
        "aim": t(row, "Action_Categorisation_Aim"), "scale": t(row, "Spatial_Scale_of_Action_Delivery"),
        "ea_wb": eawb, "wb_type": t(row, "Waterbody_Type"),
        "wb_name": t(row, "Name_of_Boundary_within_which_Action_is_being_implemented"),
        "due": as_date(g(row, "Completion_Date")),
        "bw": t(row, "PRIMARY:Name_of_Bathing_Water"), "sw": t(row, "PRIMARY:Name_of_Shellfish_Water"),
        "sssi": t(row, "PRIMARY:Name_of_SSSI"), "sac": t(row, "PRIMARY:Name_of_European_Site(SAC/SPA/RAMSAR)"),
        "mcz": t(row, "Name_of_MCZ"),
        "cdwf": t(row, "Current_Permit_DWF_(m3/d)_(or_Ml/d_for_UU)"),
        "pdwf": t(row, "Proposed_Permit_DWF_(m3/d)_(or_Ml/d_for_UU)"),
        "cbod": t(row, "Current_BOD_Permit_limit_(mg/l)"),
        "pbod": t(row, "Proposed_BOD_permit_95%ile(mg/l)(S=Summer;W=Winter)_plus_Upper_Tiers_where_applicable"),
        "cnh3": t(row, "Current_NH3_Permit_limit_(mg/l)"),
        "pnh3": t(row, "Proposed_NH3_permit_95%ile(mg/l)(S=Summer;W=Winter)_plus_Upper_Tiers_where_applicable"),
        "cp": t(row, "Current_P_Permit_limit_(mg/l)"),
        "pp": t(row, "Proposed_P_annual_average_permit_mg/l_(S=summer)/backstop_limit(mg/l)"),
        "wkey": works_key(name or ""),
        "lon": lon, "lat": lat, "source": "winep_pr24_official",
    }


def main():
    if "--pr19-xlsx" in sys.argv:
        return main_pr19(sys.argv[sys.argv.index("--pr19-xlsx") + 1])

    args = [a for a in sys.argv[1:]
            if not a.startswith("--") and a != _cfg_arg()]
    path = args[0] if args else os.environ.get("WINEP_XLSX")
    if not path:
        # Graceful no-op: the official National Dataset xlsx isn't available (e.g. an unattended
        # pipeline run without WINEP_XLSX set). Emit nothing and succeed so the step doesn't fail.
        print("-- WINEP: no xlsx path given and WINEP_XLSX unset — skipping (no-op).", file=sys.stderr)
        return
    cfg = catchment_config.load()
    org = cfg["org_id"]
    company = cfg["company"].get("annual_sheet_match", cfg["company"]["name"])
    dmap = _drivers()

    wb = load_workbook(os.path.expanduser(path), read_only=True, data_only=True)
    if SHEET not in wb.sheetnames:
        sys.exit(f"sheet '{SHEET}' not found; sheets = {wb.sheetnames}")
    it = wb[SHEET].iter_rows(values_only=True)
    hdr = [str(c).strip() if c is not None else "" for c in next(it)]
    idx = {h: i for i, h in enumerate(hdr)}
    ci = idx.get("Water_Company")

    # Stage EVERY row for this water company — do NOT pre-filter by bbox. The catchment is an
    # irregular shape, so any rectangular bbox both over-captures neighbours (harmless — they don't
    # link) and CLIPS real edge outlets (Princetown on the west, Strete/Yarrow Bank at the Dart
    # mouth), dropping them before the SQL could match them by name. The SQL step below is the single
    # source of scope: a row is kept only if it resolves to our water body / works / outlet (exact
    # name or proximity). SWW is ~1.4k rows, so staging all of them is cheap.
    rows, kept = [], 0
    for r in it:
        if ci is None or ci >= len(r) or company.upper() not in str(r[ci] or "").upper():
            continue
        rec = build_record(r, idx, dmap)
        if rec is None:
            continue
        kept += 1
        rows.append(rec)

    print(f"-- {kept} {company} PR24 WINEP rows staged (all company rows; SQL scopes to the "
          f"{cfg['river']} catchment) — {len(dmap)} driver codes decoded", file=sys.stderr)
    if not rows:
        sys.exit("no WINEP rows matched — check the company name / bbox / wb_ids in the config")
    emit(rows, org, cfg, "PR24")


def _norm_hdr(h):
    return " ".join(str(h or "").replace("\n", " ").split()).lower()


def col_raw(row, idx, kws):
    for h, i in idx.items():
        if all(k in h for k in kws) and i < len(row):
            return row[i]
    return None


def main_pr19(path):
    """PR19/AMP7 delivery baseline from the official EA PR19 WINEP spreadsheet. Not geocoded (OS
    eastings/northings, not converted for PR19), so it links by water-body id / works name only. Data
    sits on the 'WINEP DATA' sheet under a multi-row title block with ragged headers (trailing
    spaces, embedded newlines) — locate the header row by 'WINEPID' and keyword-match columns."""
    cfg = catchment_config.load()
    org = cfg["org_id"]
    wb = load_workbook(os.path.expanduser(path), read_only=True, data_only=True)
    ws = wb["WINEP DATA"] if "WINEP DATA" in wb.sheetnames else wb.active
    rows_iter = ws.iter_rows(values_only=True)

    idx, header = None, []
    for row in rows_iter:
        norm = [_norm_hdr(c) for c in row]
        if "winepid" in norm:               # the header row
            header = norm
            idx = {h: i for i, h in enumerate(norm) if h}
            break
    if idx is None:
        sys.exit("could not locate the WINEP DATA header row (no 'WINEPID' column)")

    def col(row, *keyword_sets):
        """First cell whose header contains all keywords in any set."""
        for kws in keyword_sets:
            for h, i in idx.items():
                if all(k in h for k in kws) and i < len(row) and row[i] not in (None, ""):
                    return " ".join(str(row[i]).split())
        return None

    dmap = _drivers()
    company = cfg["company"]["name"].split(" Ltd")[0]
    rows = []
    for row in rows_iter:
        comp = col(row, ["water", "company"])
        if not comp or company.lower() not in comp.lower():
            continue
        name = col(row, ["scheme", "name"], ["name", "investigation"])
        dcode = col(row, ["driver", "code", "primary"], ["driver", "code"])
        doblig, dlabel = dmap.get(dcode, (None, None))
        rows.append({
            "cycle": "PR19",
            "action_id": col(row, ["winepid"], ["unique", "id"]) or name or "",
            "comp": "", "company": comp,
            "dcode": dcode, "dlabel": dlabel, "doblig": doblig,
            "dsec": col(row, ["driver", "code", "secondary"]),
            "dter": col(row, ["driver", "code", "tertiary"]),
            "name": name, "desc": col(row, ["action", "type"], ["measure", "type"]),
            "tier1": None, "opt": col(row, ["certainty"]), "aim": col(row, ["environmental", "outcome"]),
            "scale": None,
            "ea_wb": col(row, ["waterbody", "id"], ["water", "body", "id"]),
            "wb_type": col(row, ["water", "body", "type"]),
            "wb_name": col(row, ["name", "waterbody"], ["name", "water", "body"]),
            "due": as_date(col_raw(row, idx, ["completion", "date"])),
            "bw": col(row, ["bathing"]), "sw": col(row, ["shellfish"]),
            "sssi": col(row, ["sssi"]), "sac": col(row, ["ramsar"]), "mcz": col(row, ["mcz"]),
            "cdwf": None, "pdwf": None, "cbod": None, "pbod": None, "cnh3": None, "pnh3": None,
            "cp": None, "pp": None, "wkey": works_key(name),
            "lon": None, "lat": None, "source": "winep_pr19_xlsx",
        })
    print(f"-- {len(rows)} WINEP PR19 rows for {company} (XLSX; name/wbID linkage, no geometry)", file=sys.stderr)
    if not rows:
        sys.exit("no PR19 rows for this company — check the XLSX / 'Water Company' column")
    emit(rows, org, cfg, "PR19")


if __name__ == "__main__":
    main()
