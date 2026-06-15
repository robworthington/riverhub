#!/usr/bin/env python3
"""
Re-derive sewage_systems by spatial assignment to the water company's wastewater catchment areas,
so assets group under the TERMINAL treatment works that actually treats them (e.g. Dartington's
overflows → Totnes STW), not by name. See ../ASSET-GROUPING-METHOD.md.

Source: GB wastewater catchment areas (Hoffmann et al.; water companies' own EIR catchment areas,
matched to UWWTD works). Released as a British-National-Grid shapefile + a works lookup CSV.
PostGIS does the BNG→WGS84 reprojection (ST_Transform), so no geo libs are needed beyond pyshp to
read the shapefile.

Method: load the company's catchment polygons → for each asset, the catchment it falls in is its
system (confidence 'high'); else the nearest catchment within MATCH_M metres ('medium'); else leave
its current system and flag 'low'. Assets with system_override = true are never repointed. Empty
name-based systems left behind are cleaned up. Idempotent.

Env:
    WWCA_DIR   dir containing catchments_consolidated.{shp,dbf,shx,prj} + waterbase_catchment_lookup.csv
               (download from github.com/tillahoffmann/wastewater-catchment-areas/releases)
Usage:
    WWCA_DIR=/path/to/wwca python3 import_sewage_systems.py --config ../config/catchments/dart.json > /tmp/systems.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/systems.sql
"""
import csv, json, os, sys

import catchment_config
import shapefile  # pyshp

MATCH_M = 3000  # nearest-catchment fallback distance for assets outside every polygon


def company_key(name):
    return name.lower().replace(" ltd", "").replace(".", "").strip().replace(" ", "_")


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    ckey = company_key(cfg["company"]["name"])
    wdir = os.environ.get("WWCA_DIR")
    if not wdir:
        # graceful no-op so a provisioning run isn't blocked if the dataset wasn't downloaded;
        # the instance keeps its current grouping until this step is re-run with WWCA_DIR set.
        print("-- WWCA_DIR not set; skipping system regrouping (see ASSET-GROUPING-METHOD.md)")
        print("WWCA_DIR not set — 'systems' step skipped (assets keep their current grouping). "
              "Set WWCA_DIR to the wastewater-catchment-areas release and re-run.", file=sys.stderr)
        return

    look = {}
    with open(os.path.join(wdir, "waterbase_catchment_lookup.csv")) as f:
        for r in csv.DictReader(f):
            look[r["identifier"]] = (r.get("uwwCode"), r.get("uwwName"))

    sf = shapefile.Reader(os.path.join(wdir, "catchments_consolidated"))
    fi = {fld[0]: i for i, fld in enumerate(sf.fields[1:])}
    rows = []
    for sr in sf.iterShapeRecords():
        rec = sr.record
        if rec[fi["company"]] != ckey:
            continue
        ident = rec[fi["identifier"]]; name = rec[fi["name"]]
        code, uww = look.get(ident, (None, None))
        rows.append((ident, ckey, name, code, uww, json.dumps(sr.shape.__geo_interface__)))
    if not rows:
        sys.exit(f"no catchments for company '{ckey}' — check the company name / WWCA company key")
    print(f"-- {len(rows)} {ckey} catchments", file=sys.stderr)

    orgl = q(org) + "::uuid"
    out = [f"-- River Hub: re-derive sewage_systems for {cfg['river']} from wastewater catchment areas. Idempotent.",
           "begin;",
           # one system per catchment (terminal works)
           "create unique index if not exists sewage_systems_org_catchment_uniq "
           "on sewage_systems (organisation_id, catchment_identifier) where catchment_identifier is not null;",
           "create temp table _wwc(identifier text, company text, name text, uww_code text, uww_name text, gj text) on commit drop;"]
    for r in rows:
        out.append("insert into _wwc values (" + ",".join(q(x) for x in r[:5]) + f",{q(r[5])});")

    out.append(f"delete from wastewater_catchments where organisation_id = {orgl};")
    out.append(f"""insert into wastewater_catchments (organisation_id, identifier, company, name, uww_code, uww_name, geom)
  select {orgl}, identifier, company, name, uww_code, uww_name,
         ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(gj),27700),4326)),3))
  from _wwc;""")

    # resolve each non-overridden asset to a catchment (contains → high; nearest ≤ MATCH_M → medium)
    out.append(f"""create temp table _amap on commit drop as
select sa.id as asset_id, cc.identifier, coalesce(nullif(cc.uww_name,''), cc.name) as sysname,
       cc.uww_code, cc.conf
from sewage_assets sa
left join lateral (
  select c.identifier, c.uww_name, c.name, c.uww_code,
         case when ST_Contains(c.geom, p.geom) then 'high' else 'medium' end as conf
  from wastewater_catchments c,
       lateral (select ST_SetSRID(ST_MakePoint(sa.longitude, sa.latitude),4326) as geom) p
  where c.organisation_id = {orgl}
    and (ST_Contains(c.geom, p.geom)
         or ST_DWithin(c.geom::geography, p.geom::geography, {MATCH_M}))
  order by (case when ST_Contains(c.geom, p.geom) then 0 else 1 end),
           ST_Distance(c.geom::geography, p.geom::geography)
  limit 1
) cc on true
where sa.organisation_id = {orgl} and sa.latitude is not null and sa.system_override is not true;""")

    # upsert a system per matched catchment
    out.append(f"""insert into sewage_systems (organisation_id, name, uww_code, catchment_identifier, source)
  select distinct {orgl}, sysname, uww_code, identifier, 'wwca' from _amap where identifier is not null
  on conflict (organisation_id, catchment_identifier) where catchment_identifier is not null
  do update set name = excluded.name, uww_code = excluded.uww_code, source = 'wwca';""")

    # repoint assets + record confidence
    out.append(f"""update sewage_assets sa set sewage_system_id = s.id, system_match_confidence = m.conf
  from _amap m join sewage_systems s
    on s.organisation_id = {orgl} and s.catchment_identifier = m.identifier
  where sa.id = m.asset_id and m.identifier is not null;""")
    out.append(f"""update sewage_assets sa set system_match_confidence = 'low'
  from _amap m where sa.id = m.asset_id and m.identifier is null;""")

    # clean up empty legacy (name-based) systems with no assets and no assumptions
    out.append(f"""delete from sewage_systems s where s.organisation_id = {orgl} and s.catchment_identifier is null
  and not exists (select 1 from sewage_assets a where a.sewage_system_id = s.id)
  and not exists (select 1 from system_assumptions x where x.system_id = s.id);""")

    out.append(f"select 'systems now: ' || count(*) from sewage_systems where organisation_id = {orgl};")
    out.append(f"select 'assets high/medium/low: ' || "
               f"count(*) filter (where system_match_confidence='high') || '/' || "
               f"count(*) filter (where system_match_confidence='medium') || '/' || "
               f"count(*) filter (where system_match_confidence='low') from sewage_assets where organisation_id = {orgl};")
    out.append("commit;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
