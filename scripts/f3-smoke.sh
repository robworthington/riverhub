#!/usr/bin/env bash
# River Hub Phase 4 — F3/F4 smoke test for the national deployment.
# Usage: bash scripts/f3-smoke.sh https://riverhub-national-xxxx.vercel.app [CRON_SECRET]
#   With CRON_SECRET it also triggers /api/cron/edm-sync once (E4) — that WRITES to the DB.
set -uo pipefail

BASE="${1:-}"
CRON="${2:-}"
if [ -z "$BASE" ]; then echo "usage: $0 <base-url> [cron-secret]"; exit 2; fi
BASE="${BASE%/}"

# Sample asset dossiers (one per river, pulled from the national DB at handoff time).
DART_ASSET="0a573b40-3560-4604-afa6-8ba16dbcb006"
TEIGN_ASSET="01251954-1e2f-4aec-b627-5340ed6e4968"

pass=0; fail=0
check() { # path  expect-substring(optional)
  local path="$1"; local marker="${2:-}"
  local url="$BASE$path"
  local body code
  body="$(curl -sS -m 30 -w $'\n%{http_code}' "$url" 2>/dev/null)"
  code="$(printf '%s' "$body" | tail -1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [ "$code" = "200" ] && { [ -z "$marker" ] || printf '%s' "$body" | grep -qi -- "$marker"; }; then
    printf "  OK   %-55s %s\n" "$path" "$code"; pass=$((pass+1))
  else
    printf "  FAIL %-55s %s %s\n" "$path" "$code" "${marker:+(missing: $marker)}"; fail=$((fail+1))
  fi
}

echo "== national summary =="
check "/" "Teign"
check "/" "Dart"

for r in dart teign; do
  echo "== /r/$r =="
  check "/r/$r/explore/spills"
  check "/r/$r/explore/spills/gaps"
  check "/r/$r/explore/spills/emergency-overflows"
  check "/r/$r/explore/spills/measures"
  check "/r/$r/explore/spills/map"
  check "/r/$r/explore/councils"
  check "/r/$r/explore/ea-monitoring"
done

echo "== asset dossiers =="
check "/r/dart/explore/spills/$DART_ASSET"
check "/r/teign/explore/spills/$TEIGN_ASSET"

echo "== public stats API =="
check "/api/public/stats"

if [ -n "$CRON" ]; then
  echo "== cron edm-sync (writes!) =="
  code="$(curl -sS -m 120 -o /tmp/f3_cron_out.json -w '%{http_code}' \
          -H "Authorization: Bearer $CRON" "$BASE/api/cron/edm-sync" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    echo "  OK   /api/cron/edm-sync 200"; echo "  body: $(head -c 400 /tmp/f3_cron_out.json)"; pass=$((pass+1))
  else
    echo "  FAIL /api/cron/edm-sync $code"; head -c 400 /tmp/f3_cron_out.json; echo; fail=$((fail+1))
  fi
fi

echo ""
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
