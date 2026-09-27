#!/usr/bin/env python3
"""Run a .sql file against a Postgres DB.

The .sql files from import_catchment.py contain their own `begin; … commit;`,
so the whole file is ONE transaction on the server: if any statement fails,
nothing is committed (matches the behaviour you already saw).

Usage:
    export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/postgres'   # never commit this
    python3 run_sql.py teign_catchment.sql

The connection string comes only from the environment — it is never printed.
"""
import os
import sys


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 run_sql.py <file.sql>")
    path = sys.argv[1]

    url = (os.environ.get("DATABASE_URL") or os.environ.get("DB_URL") or "").strip()
    if not url:
        sys.exit("set DATABASE_URL (or DB_URL) to the target database connection string")

    try:
        import psycopg2
    except ImportError:
        sys.exit("psycopg2 not installed — run:  python3 -m pip install psycopg2-binary")

    with open(path) as f:
        sql = f.read()

    conn = psycopg2.connect(url)
    conn.autocommit = True  # the file's own begin;/commit; is the transaction boundary
    try:
        with conn.cursor() as cur:
            cur.execute(sql)  # no params -> psycopg2 sends the whole multi-statement file
        for note in conn.notices:
            sys.stderr.write(note)
        print(f"OK: {path} applied (committed).")
    except Exception as e:
        # begin;/commit; means the server already rolled the whole file back.
        print(f"FAILED: {path} — nothing committed.\n{type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
