#!/usr/bin/env bash
# River Hub — per-river onboarding verification (national multi-tenant model).
#
# Usage:
#   scripts/verify-river.sh <slug> <org-uuid> [base-url] [db-url]
#
#   <slug>      river_slug, e.g. yealm
#   <org-uuid>  organisations.id for that river
#   [base-url]  national deployment, e.g. https://riverhub-national.vercel.app
#               (page checks need the river live=true + a current build; omit to skip)
#   [db-url]    national DB connection (psql); omit to skip the DB reconciliation.
#               If no local psql, uses the dockerised postgres:16 client.
#
# Why this exists: setup_catchment.py's built-in verification counts are WHOLE-TABLE
# (select count(*) from sewage_assets) — in a shared multi-org DB they show the
# cumulative total across every river, so they can't tell you what THIS river loaded.
# This script reconciles per-org (where organisation_id = <org>) and page-tests the
# river's public portal.
set -uo pipefail

SLUG="${1:-}"; ORG="${2:-}"; BASE="${3:-}"; DBURL="${4:-}"
if [ -z "$SLUG" ] || [ -z "$ORG" ]; then
  echo "usage: $0 <slug> <org-uuid> [base-url] [db-url]"; exit 2
fi
BASE="${BASE%/}"
pass=0; fail=0

psql_q() { # runs SQL on stdin, tab-separated unaligned
  if command -v psql >/dev/null 2>&1; then
    psql "$DBURL" -v ON_ERROR_STOP=1 -qAtF $'\t'
  else
    docker run --rm -i postgres:16 psql "$DBURL" -v ON_ERROR_STOP=1 -qAtF $'\t'
  fi
}

# ---------- DB: org-scoped reconciliation ----------
SAMPLE_ASSET=""
if [ -n "$DBURL" ]; then
  echo "== DB reconciliation (organisation_id = $ORG) =="
  psql_q <<SQL
\\set org '${ORG}'
with t(label, n) as (
  select 'sewage_assets',       count(*) from sewage_assets       where organisation_id=:'org'
  union all select 'sewage_systems',      count(*) from sewage_systems      where organisation_id=:'org'
  union all select 'spill_events',        count(*) from spill_events        where organisation_id=:'org'
  union all select 'edm_snapshots',       count(*) from edm_snapshots       where organisation_id=:'org'
  union all select 'edm_annual_stats',    count(*) from edm_annual_stats    where organisation_id=:'org'
  union all select 'emergency_overflows', count(*) from emergency_overflows where organisation_id=:'org'
  union all select 'eo_annual_spills',    count(*) from eo_annual_spills    where organisation_id=:'org'
  union all select 'winep_actions',       count(*) from winep_actions       where organisation_id=:'org'
  union all select 'water_bodies',        count(*) from water_bodies        where organisation_id=:'org'
  union all select 'wastewater_catchments',count(*) from wastewater_catchments where organisation_id=:'org'
  union all select 'protected_areas',     count(*) from protected_areas     where organisation_id=:'org'
  union all select 'rainfall_stations',   count(*) from rainfall_stations   where organisation_id=:'org'
  union all select 'river_gauges',        count(*) from river_gauges        where organisation_id=:'org'
  union all select 'test_sites',          count(*) from test_sites          where organisation_id=:'org'
  union all select 'test_results',        count(*) from test_results        where organisation_id=:'org'
  union all select 'ea_wq_stats',         count(*) from ea_wq_stats         where organisation_id=:'org'
  union all select 'ea_wq_samples',       count(*) from ea_wq_samples       where organisation_id=:'org'
)
select label, n from t order by label;
SQL
  echo "  -- asset coding (parish + water body) --"
  psql_q <<SQL
\\set org '${ORG}'
select 'assets_total='||count(*)||'  coded_parish='||count(parish_id)||'  coded_wb='||count(water_body_id)
from sewage_assets where organisation_id=:'org';
SQL
  echo "  -- systems grouping source (wwca = works-grouped) --"
  psql_q <<SQL
\\set org '${ORG}'
select coalesce(source,'(null)')||'='||count(*)
from sewage_systems where organisation_id=:'org' group by source order by 1;
SQL
  # a sample asset for the dossier page-check
  SAMPLE_ASSET="$(printf "\\set org '%s'\nselect id from sewage_assets where organisation_id=:'org' order by asset_name limit 1;" "$ORG" | psql_q | head -1)"
  echo ""
fi

# ---------- Pages: river portal smoke ----------
if [ -n "$BASE" ]; then
  check() { local path="$1"; local marker="${2:-}"
    local body code; body="$(curl -sS -m 30 -w $'\n%{http_code}' "$BASE$path" 2>/dev/null)"
    code="$(printf '%s' "$body" | tail -1)"; body="$(printf '%s' "$body" | sed '$d')"
    if [ "$code" = "200" ] && { [ -z "$marker" ] || printf '%s' "$body" | grep -qi -- "$marker"; }; then
      printf "  OK   %-52s %s\n" "$path" "$code"; pass=$((pass+1))
    else
      printf "  FAIL %-52s %s %s\n" "$path" "$code" "${marker:+(missing: $marker)}"; fail=$((fail+1))
    fi; }
  echo "== /r/$SLUG portal pages (needs live=true + current build) =="
  check "/r/$SLUG/explore/spills"
  check "/r/$SLUG/explore/spills/gaps"
  check "/r/$SLUG/explore/spills/emergency-overflows"
  check "/r/$SLUG/explore/spills/measures"
  check "/r/$SLUG/explore/spills/map"
  check "/r/$SLUG/explore/councils"
  check "/r/$SLUG/explore/ea-monitoring"
  [ -n "$SAMPLE_ASSET" ] && check "/r/$SLUG/explore/spills/$SAMPLE_ASSET"
  echo ""
  echo "RESULT: $pass passed, $fail failed"
  [ "$fail" -eq 0 ] || exit 1
fi
