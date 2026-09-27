#!/usr/bin/env python3
"""Print identity + org info for the DB that DATABASE_URL points to.

    export DATABASE_URL='...'   # the SAME value you use with run_sql.py
    python3 check_db.py

This queries the exact database run_sql.py would write to, so it settles
which database you are actually connected to.
"""
import os
import sys

url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL (or DB_URL) first")

import psycopg2

conn = psycopg2.connect(url)
cur = conn.cursor()

cur.execute("select current_database(), current_user, inet_server_addr()::text")
db, usr, host = cur.fetchone()
print(f"connected to db={db} user={usr} server={host}")

cur.execute("select id, name from organisations order by name")
rows = cur.fetchall()
print(f"organisations ({len(rows)}):")
for oid, name in rows:
    print(f"  {oid}  {name}")

try:
    cur.execute("select public_org from app_config limit 1")
    print(f"app_config.public_org: {cur.fetchone()[0]}")
except Exception as e:
    print(f"app_config: {type(e).__name__}: {e}")

conn.close()
