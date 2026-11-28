#!/usr/bin/env python3
"""
Welsh communities as council areas (step `parishes` for "nation": "wales"; WALES-ROLLOUT-PLAN.md §5).
Wales has communities (most with a community or town council) where England has civil parishes. They go
into the same `parishes` table, keyed by their ONS code (W04…), with the local authority as district, so
the council-area pages work unchanged. Source: Welsh Government community and town councils layer on
DataMapWales (878 communities, OGL v3), boundaries simplified to about 20 m.
  python3 scripts/import_wales_communities.py --config config/catchments/teifi.json > /tmp/communities.sql
"""
import re
import sys

import catchment_config
import wales_common as wc


def display_name(name):
    """"Llandysul Community" / "Cardigan Town" -> "Llandysul" / "Cardigan"."""
    return re.sub(r"\s+(Community|Town|City)( Council)?$", "", (name or "").strip())


def main():
    cfg = catchment_config.load()
    s, w, n, e = cfg["geo"]["bbox"]
    feats = wc.wfs("geonode:community_and_town_councils", props=["name_en", "name_cy", "la_en", "code", "geom"],
                   bbox=(w, s, e, n))
    if not feats:
        sys.exit("no communities returned for the config's bbox")
    print(f"-- {len(feats)} Welsh communities in the {cfg['river']} bbox", file=sys.stderr)
    county = cfg.get("county")
    out = [f"-- River Hub: Welsh communities for {cfg['river']} (Welsh Government / ONS, OGL v3). Idempotent.",
           "begin;",
           "create temp table _com(code text primary key, name text, district text, geom geometry) on commit drop;"]
    for f in feats:
        p = f["properties"]
        g = wc.simplify_geometry(f["geometry"], tol=0.0002)
        if not g["coordinates"] or not p.get("code"):
            continue
        out.append(f"insert into _com values ({wc.q(p['code'])}, {wc.q(display_name(p['name_en']))}, "
                   f"{wc.q((p['la_en'] or '').title())}, ST_Multi(ST_CollectionExtract({wc.geojson_sql(g)}, 3))) "
                   "on conflict do nothing;")
    out.append(f"""
update parishes t set boundary = s.geom, name = s.name, district = s.district
from _com s where t.ons_code = s.code;

insert into parishes (name, district, county, ons_code, boundary)
select s.name, s.district, coalesce({wc.q(county)}, s.district), s.code, s.geom
from _com s
where not exists (select 1 from parishes t where t.ons_code = s.code)
on conflict (name, district) do update set ons_code = excluded.ons_code, boundary = excluded.boundary;

commit;
select 'Welsh communities with boundary: ' || count(*) from parishes where ons_code like 'W04%' and boundary is not null;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
