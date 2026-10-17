#!/usr/bin/env bash
# One-shot WINEP refresh for a single River Hub instance, official EA data only:
#   1) generate SQL from the official PR24 WINEP National Dataset xlsx
#   2) apply it to the DB
#   3) report coverage (winep_coverage.py)
#   4) prove completeness (winep_audit.py) — exits non-zero if any in-scope measure is missing
#
# Point DATABASE_URL at the target instance (session pooler, port 5432) before running:
#   export DATABASE_URL='<instance session-pooler URL>'
#   ./winep_apply.sh config/catchments/dart.json "/path/to/PR24 WINEP National Dataset.xlsx"
#
# Steps 1-3 abort on error; step 4 (the audit) runs last so its pass/fail is the script's exit code.
set -euo pipefail

cfg="${1:?usage: winep_apply.sh <config.json> <official PR24 xlsx path>}"
xlsx="${2:?usage: winep_apply.sh <config.json> <official PR24 xlsx path>}"
: "${DATABASE_URL:?set DATABASE_URL to the target instance first}"
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "DATABASE_URL is not a postgres URL (starts with '$(printf %.20s "$DATABASE_URL")'). Did the export line get mangled?" >&2; exit 2;;
esac

here="$(cd "$(dirname "$0")" && pwd)"
name="$(basename "$cfg" .json)"
sql="$here/${name}_winep.sql"

echo "== 1/4 generate official WINEP SQL ($name) =="
python3 "$here/scripts/import_winep.py" --config "$cfg" "$xlsx" > "$sql"

echo "== 2/4 apply to DB =="
python3 "$here/run_sql.py" "$sql"

echo "== 3/4 coverage =="
python3 "$here/winep_coverage.py"

echo "== 4/4 completeness audit =="
python3 "$here/winep_audit.py" --config "$cfg" "$xlsx"
