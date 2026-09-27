#!/usr/bin/env python3
"""Look up one or more asset_unique_ids in the DB that DATABASE_URL points to.

    export DATABASE_URL='...'            # the target instance's connection string
    python3 find_asset.py SBB00614 SBB00240 SBB00295

Prints each code's sewage_assets row (name, type, system, edm_enabled) or MISSING.
Also prints the total asset count for the org, so you can see if it grew.
"""
import os
import sys

codes = sys.argv[1:] or ["SBB00614"]
url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")

import psycopg2
conn = psycopg2.connect(url)
cur = conn.cursor()

cur.execute("select public_org from app_config limit 1")
org = cur.fetchone()[0]
cur.execute("select count(*) from sewage_assets where organisation_id = %s", (org,))
print(f"org {org}: {cur.fetchone()[0]} total assets")

cur.execute(
    """select a.asset_unique_id, a.asset_name, a.asset_type, a.edm_enabled,
              s.name
       from sewage_assets a
       left join sewage_systems s on s.id = a.sewage_system_id
      where a.organisation_id = %s and a.asset_unique_id = any(%s)""",
    (org, codes),
)
found = {r[0]: r for r in cur.fetchall()}
for c in codes:
    if c in found:
        _, name, atype, edm, sysname = found[c]
        print(f"  {c}: FOUND  '{name}'  type={atype}  edm={edm}  system={sysname}")
    else:
        print(f"  {c}: MISSING")

# spill_events history by year for each requested code
print("spill_events by year:")
cur.execute(
    """select a.asset_unique_id,
              extract(year from e.event_start)::int as yr,
              count(*) as n
       from spill_events e
       join sewage_assets a on a.id = e.asset_id
      where a.organisation_id = %s and a.asset_unique_id = any(%s)
      group by 1, 2 order by 1, 2""",
    (org, codes),
)
by_code = {}
for uid, yr, n in cur.fetchall():
    by_code.setdefault(uid, []).append(f"{yr}:{n}")
for c in codes:
    yrs = by_code.get(c)
    print(f"  {c}: {'  '.join(yrs) if yrs else '(no spill_events)'}")

conn.close()
