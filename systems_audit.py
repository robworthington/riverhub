#!/usr/bin/env python3
"""Audit sewage_systems vs system_assumptions for the DB in DATABASE_URL.

Shows every system: asset count, STW count, its system_assumptions population/
override, and when it was created/estimated — to reveal duplicate/renamed systems
that split assets from their populated assumptions.

    export DATABASE_URL='...'
    python3 systems_audit.py
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

cur.execute(
    """
    select s.name,
           count(a.id) as n_assets,
           count(a.id) filter (where a.asset_type='sewage_treatment_works') as n_stw,
           sa.ons_population, sa.population_override, sa.ons_calculated_at
    from sewage_systems s
    left join sewage_assets a on a.sewage_system_id = s.id
    left join system_assumptions sa on sa.system_id = s.id
    where s.organisation_id = %s
    group by s.id, s.name, sa.ons_population, sa.population_override, sa.ons_calculated_at
    order by (count(a.id)=0), s.name
    """,
    (org,),
)
rows = cur.fetchall()
print(f"{len(rows)} systems total\n")
print(f"{'system':<32} {'ast':>3} {'stw':>3} {'ons':>6} {'ovr':>6}  {'estimated_at'}")
empties = 0
for name, nast, nstw, ons, ovr, at in rows:
    if nast == 0:
        empties += 1
    at_s = at.date().isoformat() if at else ""
    print(f"{(name or '')[:32]:<32} {nast:>3} {nstw:>3} {str(ons or ''):>6} {str(ovr or ''):>6}  {at_s}")

# orphaned system_assumptions (row exists but its system has no assets / doesn't match)
cur.execute(
    """select count(*) from system_assumptions sa
       where sa.organisation_id=%s
         and not exists (select 1 from sewage_assets a where a.sewage_system_id = sa.system_id)""",
    (org,),
)
print(f"\nsystem_assumptions rows whose system has NO assets: {cur.fetchone()[0]}")
print(f"systems with zero assets (orphaned/duplicate): {empties}")
conn.close()
