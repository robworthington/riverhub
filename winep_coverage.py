#!/usr/bin/env python3
"""Report WINEP coverage for the DB in DATABASE_URL: how many assets have a linked WINEP action.

    export DATABASE_URL='<Dart or Teign>'
    python3 winep_coverage.py
"""
import os, sys
url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")
import psycopg2
conn = psycopg2.connect(url); cur = conn.cursor()
cur.execute("select public_org from app_config limit 1"); org = cur.fetchone()[0]

cur.execute("""
  select count(*) total,
         count(*) filter (where linked) linked,
         count(*) filter (where not linked) unlinked,
         count(*) filter (where via_link and not via_aid) link_only,
         count(*) filter (where via_aid) aid
  from (
    select a.id,
      exists(select 1 from winep_asset_links l where l.asset_id = a.id) as via_link,
      exists(select 1 from winep_actions w where w.asset_id = a.id)     as via_aid,
      (exists(select 1 from winep_asset_links l where l.asset_id = a.id)
       or exists(select 1 from winep_actions w where w.asset_id = a.id)) as linked
    from sewage_assets a where a.organisation_id = %s) t
""", (org,))
tot, linked, unlinked, link_only, aid = cur.fetchone()
print(f"org {org}")
print(f"assets: {tot} total | {linked} with a measure shown (has_action) | {unlinked} with NONE "
      f"({100*unlinked/tot:.0f}% unlinked)")
print(f"  how they link: {aid} via winep_actions.asset_id | {link_only} via manual winep_asset_links only")
cur.execute("select count(*), count(distinct asset_id) from winep_asset_links where organisation_id = %s", (org,))
lr, la = cur.fetchone()
print(f"  winep_asset_links (manual): {lr} rows across {la} assets")

# unlinked but flagged (spilling problem, yet no measure) — the real accountability gap
cur.execute("""
  select count(distinct a.id) from sewage_assets a
  where a.organisation_id = %s
    and not (exists (select 1 from winep_asset_links l where l.asset_id = a.id)
             or exists (select 1 from winep_actions w where w.asset_id = a.id))
    and exists (select 1 from spill_events e where e.asset_id = a.id)
""", (org,))
print(f"  of which have spill history but no measure: {cur.fetchone()[0]}")

# winep_actions breakdown by source + how many carry an asset link
cur.execute("""
  select coalesce(source,'(null)'), count(*),
         count(*) filter (where asset_id is not null)
  from winep_actions where organisation_id = %s group by 1 order by 2 desc
""", (org,))
print("winep_actions by source  (total | asset-linked):")
for src, n, na in cur.fetchall():
    print(f"  {src:<26} {n:>5} | {na}")

# ---- Review log: measures the importer scoped to this catchment but could NOT link ----
try:
    cur.execute("""
      select run_at, count(*) from winep_import_log where organisation_id = %s
      group by run_at order by run_at desc limit 1
    """, (org,))
    row = cur.fetchone()
    if not row:
        print("\nreview log: no unmatched measures recorded (winep_import_log empty for this org).")
    else:
        run_at, cnt = row
        print(f"\nREVIEW LOG — {cnt} measure(s) scoped to the catchment but NOT imported (run {run_at:%Y-%m-%d %H:%M}):")
        cur.execute("""
          select action_id, coalesce(action_component,''), action_name, driver_code,
                 completion_date, reason
          from winep_import_log
          where organisation_id = %s and run_at = %s
          order by reason, action_name
        """, (org, run_at))
        for aid, comp, name, drv, due, reason in cur.fetchall():
            d = due.isoformat() if due else "-"
            print(f"  [{drv or '-':<12}] {(name or '(no name)')[:46]:<46} due {d:<10} {aid}{('/'+comp) if comp else ''}")
            print(f"      -> {reason}")
except psycopg2.errors.UndefinedTable:
    conn.rollback()
    print("\nreview log: winep_import_log not present yet (run import_winep.py first).")
conn.close()
