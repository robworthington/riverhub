#!/usr/bin/env python3
"""Diagnose why STW system populations are empty for the DB in DATABASE_URL.

    export DATABASE_URL='...'
    python3 check_population.py

Reports: parish coverage, system_assumptions rows, and per-STW-system the
ons_population / override / effective population and how many parishes its
assets actually fall in — which tells us whether the gap is missing parishes,
missing system rows, or unrun estimation.
"""
import os
import sys

url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")
import psycopg2

conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute("select public_org from app_config limit 1")
org = cur.fetchone()[0]
print(f"org {org}\n")

cur.execute("select count(*), count(*) filter (where coalesce(census_2021_population,0)>0), count(*) filter (where boundary is not null) from parishes")
p_tot, p_pop, p_geo = cur.fetchone()
print(f"parishes (shared table): {p_tot} loaded, {p_geo} with boundary, {p_pop} with census_2021_population > 0")

cur.execute("select count(*), count(*) filter (where coalesce(ons_population,0)>0), count(*) filter (where population_override is not null) from system_assumptions where organisation_id=%s", (org,))
sa_tot, sa_ons, sa_ovr = cur.fetchone()
print(f"system_assumptions: {sa_tot} rows, {sa_ons} with ons_population>0, {sa_ovr} with override\n")

# per STW-bearing system: population + how many parishes its assets fall in
cur.execute(
    """
    with stw_systems as (
      select distinct s.id, s.name
      from sewage_systems s
      join sewage_assets a on a.sewage_system_id = s.id
      where s.organisation_id = %s and a.asset_type = 'sewage_treatment_works'
    ),
    parish_hits as (
      select s.id as sys, count(distinct p.id) as n_parish,
             count(distinct a.id) filter (where a.latitude is not null) as n_geo_assets
      from stw_systems s
      join sewage_assets a on a.sewage_system_id = s.id
      left join parishes p on p.boundary is not null
        and a.latitude is not null
        and st_contains(p.boundary, st_setsrid(st_makepoint(a.longitude, a.latitude), 4326))
      group by s.id
    )
    select ss.name,
           sa.ons_population, sa.population_override,
           coalesce(sa.population_override, sa.ons_population) as effective,
           ph.n_geo_assets, ph.n_parish
    from stw_systems ss
    left join system_assumptions sa on sa.system_id = ss.id
    left join parish_hits ph on ph.sys = ss.id
    order by ss.name
    """,
    (org,),
)
rows = cur.fetchall()
print(f"STW-bearing systems: {len(rows)}")
print(f"{'system':<34} {'ons':>7} {'ovr':>7} {'eff':>7} {'geoAst':>6} {'parish':>6}")
for name, ons, ovr, eff, ngeo, npar in rows:
    print(f"{(name or '')[:34]:<34} {str(ons or ''):>7} {str(ovr or ''):>7} {str(eff or ''):>7} {str(ngeo or 0):>6} {str(npar or 0):>6}")

conn.close()
