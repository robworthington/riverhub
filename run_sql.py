#!/usr/bin/env python3
"""Apply a .sql file to the database in DATABASE_URL.

Runs the whole file as one request, so a file that manages its own
transaction (begin; ... commit;) and uses temp tables with ON COMMIT DROP
works as written. Prints the last statement's result rows (the import SQL
ends with VERIFY count SELECTs) and any server notices.

    export DATABASE_URL='<session pooler URL>'
    python3 run_sql.py dart_winep.sql
"""
import os, sys

url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
if not url:
    sys.exit("set DATABASE_URL first")
if len(sys.argv) < 2:
    sys.exit("usage: run_sql.py <file.sql>")
path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    sql = fh.read()

import psycopg2

conn = psycopg2.connect(url)
# The file carries its own begin/commit; autocommit lets libpq honour them.
conn.autocommit = True
cur = conn.cursor()
try:
    cur.execute(sql)
except Exception as e:
    # A file-level begin/commit means a mid-file error already rolled the
    # server transaction back; surface it and stop.
    print(f"FAILED: {e}", file=sys.stderr)
    sys.exit(1)

# psycopg2 exposes only the final statement's result set; the earlier VERIFY
# lines still ran server-side. winep_coverage.py reports the authoritative
# numbers and the persistent winep_import_log afterwards.
if cur.description:
    for row in cur.fetchall():
        print("  " + " | ".join("" if v is None else str(v) for v in row))
for notice in conn.notices:
    sys.stderr.write(notice)
print(f"applied {path} OK")
conn.close()
