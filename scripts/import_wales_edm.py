#!/usr/bin/env python3
"""
Dŵr Cymru annual EDM returns (step `edm` for "nation": "wales"; WALES-ROLLOUT-PLAN.md §5).

For each year in the config's edm_years, reads DCWW's annual return layer (EDM2022, EDM_2023, EDM_2024,
EDM_2025: permit, site, block-counted spills, hours, % data), matches each row to one of the river's
DCWW live outlets by location and name (the live feed has no permit number; dcww_crosswalk.py), and
writes edm_annual_stats with outlet_id = the outlet's DCWW_ID. Only rows that match an outlet already
loaded for this river (step `assets`) are kept. Replaces only the years it loads.
  python3 scripts/import_wales_edm.py --config config/catchments/teifi.json > /tmp/edm.sql
"""
import sys

import catchment_config
import wales_common as wc


def num(v):
    try:
        return repr(float(v))
    except (TypeError, ValueError):
        return "null"


def main():
    cfg = catchment_config.load()
    s, w, n, e = cfg["geo"]["bbox"]
    bbox = (w, s, e, n)
    live = [((lon, lat), name, dcww_id) for dcww_id, name, (lon, lat), _ in wc.dcww_live(bbox)]
    years = sorted(cfg.get("edm_years") or [2025])
    org = wc.q(cfg["org_id"]) + "::uuid"
    out = [f"-- River Hub: {wc.DCWW_NAME} annual EDM returns for {cfg['river']}, {years[0]}–{years[-1]}. Idempotent.",
           "begin;",
           "create temp table _edm(outlet_id text, year int, spill_count numeric, dur numeric, pct numeric, "
           "site text) on commit drop;"]
    loaded = []
    for yr in years:
        rows = wc.dcww_annual(yr, bbox)
        best = {}
        for r in rows:
            m = wc.best_match((r["lon"], r["lat"]), r["site"], live, radius=100)
            if not m:
                continue
            dcww_id, d, shared = m
            # one row per outlet per year: keep the closest, best-named annual row
            key = (dcww_id, yr)
            if key not in best or (shared, -d) > best[key][0]:
                best[key] = ((shared, -d), r)
        for (dcww_id, _), (_, r) in best.items():
            out.append(f"insert into _edm values ({wc.q(dcww_id)}, {yr}, {num(r['counted'])}, {num(r['duration'])}, "
                       f"{num(r['pct'])}, {wc.q(r['site'])});")
        print(f"-- {yr}: {len(rows)} annual rows in the bbox, {len(best)} matched to live outlets", file=sys.stderr)
        if rows:
            loaded.append(yr)
    if not loaded:
        sys.exit("no annual-return rows found for the config's bbox")
    yrs = ",".join(str(y) for y in loaded)
    out.append(f"""
delete from edm_annual_stats where organisation_id = {org} and year in ({yrs}) and source = 'dcww-edm';
insert into edm_annual_stats
    (organisation_id, asset_id, outlet_id, year, spill_count, total_duration_hours, reporting_pct, site_name, source)
  select {org}, sa.id, e.outlet_id, e.year, e.spill_count, e.dur, e.pct, e.site, 'dcww-edm'
  from _edm e join sewage_assets sa on sa.organisation_id = {org} and sa.asset_unique_id = e.outlet_id
  on conflict (organisation_id, outlet_id, year) do update set
     asset_id = excluded.asset_id, spill_count = excluded.spill_count,
     total_duration_hours = excluded.total_duration_hours, reporting_pct = excluded.reporting_pct,
     site_name = excluded.site_name, source = excluded.source;
select 'DCWW annual rows: ' || count(*) from edm_annual_stats where organisation_id = {org} and source = 'dcww-edm';
commit;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
