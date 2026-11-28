#!/usr/bin/env python3
"""
Dŵr Cymru Welsh Water overflows (step `assets` for "nation": "wales"; WALES-ROLLOUT-PLAN.md §5).

Reads DCWW's live storm overflow feed (Spill_Prod__External: DCWW_ID, name, location) in the river's
bbox, keeps the outlets within wfd.buffer_m of the river's outline (catchment_boundaries, so run the
`boundary` step first), and upserts them into sewage_assets with asset_unique_id = DCWW_ID and
edm_feed_url = the live feed. The asset type comes from DCWW's latest annual return, matched by
location and name (the live feed has no permit number; see dcww_crosswalk.py).

edm_enabled is false for now: the hourly sync (src/lib/edm/sync.ts) reads only NSOH-format feeds, and
DCWW's feed has its own format (text status, ISO dates). Switch it on when the DCWW reader exists.

Licence: DCWW states no licence on these layers yet; asked 27 Nov 2026 (WALES-ROLLOUT-PLAN.md W1).
Welsh rivers stay hidden (live=false) until that is settled.
  python3 scripts/import_dcww_assets.py --config config/catchments/teifi.json > /tmp/assets.sql
"""
import datetime
import sys

import catchment_config
import wales_common as wc


def main():
    cfg = catchment_config.load()
    s, w, n, e = cfg["geo"]["bbox"]
    bbox = (w, s, e, n)
    live = wc.dcww_live(bbox)
    annual = []
    for yr in sorted(cfg.get("edm_years") or [2025], reverse=True):
        annual = wc.dcww_annual(yr, bbox)
        if annual:
            break
    cands = [((r["lon"], r["lat"]), r["site"], r) for r in annual]
    buffer_m = int(cfg.get("wfd", {}).get("buffer_m") or 150)
    org = wc.q(cfg["org_id"]) + "::uuid"
    prov = f"{cfg['provenance']} ({datetime.date.today().isoformat()})"
    print(f"-- {cfg['river']}: {len(live)} DCWW live outlets in the bbox; {len(annual)} annual-return rows for types",
          file=sys.stderr)

    out = [f"-- River Hub: {wc.DCWW_NAME} overflows for {cfg['river']}. Idempotent.", "begin;",
           "create temp table _dc(id text primary key, name text, rwc text, atype text, lon float, lat float, "
           "geom geometry) on commit drop;"]
    for dcww_id, name, (lon, lat), rwc in live:
        m = wc.best_match((lon, lat), name, cands, radius=100)
        at = wc.asset_type(m[0]["type"] if m else None, name)
        out.append(f"insert into _dc values ({wc.q(dcww_id)}, {wc.q(name)}, {wc.q(rwc)}, {wc.q(at)}, {lon}, {lat}, "
                   f"ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326)) on conflict do nothing;")
    out.append(f"""
create temp table _catp on commit drop as
  select ST_Subdivide(ST_MakeValid(ST_Transform(geom, 27700)), 256) g
  from catchment_boundaries where organisation_id = {org};
create index on _catp using gist (g);
create temp table _in on commit drop as
  select d.* from _dc d
  where exists (select 1 from _catp c where ST_DWithin(c.g, ST_Transform(d.geom, 27700), {buffer_m}));

insert into sewage_assets
    (organisation_id, asset_name, asset_unique_id, asset_type, asset_owner, edm_feed_url,
     latitude, longitude, edm_enabled, notes)
  select {org}, i.name, i.id, i.atype::asset_type, {wc.q(wc.DCWW_NAME)}, {wc.q(wc.DCWW_LIVE)},
         i.lat, i.lon, false, {wc.q(prov)}
  from _in i
  on conflict (organisation_id, asset_unique_id) do update set
     asset_name = excluded.asset_name, asset_type = excluded.asset_type, edm_feed_url = excluded.edm_feed_url,
     latitude = excluded.latitude, longitude = excluded.longitude, notes = excluded.notes,
     edm_enabled = excluded.edm_enabled;

select 'DCWW outlets in the catchment: ' || count(*) from _in;
commit;""")
    if not (s and w):
        sys.exit("bad bbox")
    print("\n".join(out))


if __name__ == "__main__":
    main()
