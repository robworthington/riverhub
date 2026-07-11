# Deploying the protected & priority sites layer

Per-instance runbook to load the protected-areas feature (schema + designations + SODRP crosswalk).
Method + provenance: [PRIORITY-SITES-METHOD.md](PRIORITY-SITES-METHOD.md). You run all prod DB
commands; the app code is already deployed (Vercel serves it), so this is migrations + importers.

## 0. Set the target instance's connection (from its Supabase → Connect → Session pooler)
```bash
export PROJECT_REF="<instance-ref>"          # e.g. Dart = srxibtugcaojjleuspct
export PGHOST="aws-1-eu-west-2.pooler.supabase.com"   # exact host from the pooler string
export PGPASSWORD='<instance-db-password>'
echo "ref=$PROJECT_REF  host=$PGHOST  passlen=${#PGPASSWORD}"   # no <...> left
```
⚠️ Re-run this every time you switch instances — vars persist in the shell, so a stale `PROJECT_REF`
loads data into the wrong database. Use the **Session pooler** (port 5432).

Pre-flight — confirm you're on the right DB and note its `org_id`:
```bash
docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:16 \
  psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -c "select id, name from organisations;"
```

## 1. Migrations (idempotent)
```bash
cd ~/riverhub
for m in 0040_protected_areas 0041_protected_areas_attrs 0042_sodrp_crosswalk; do
  echo "=== applying $m ==="
  docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
    psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1 \
    < "supabase/migrations/${m}.sql"
done
```
- `0040` — `protected_areas` table + RLS + `public_protected_areas` / `protected_areas_for_parishes`
- `0041` — adds `attrs` to those RPCs (bathing-water classification etc.)
- `0042` — `sodrp_for_asset` / `sodrp_priority_assets` (SODRP crosswalk RPCs)

> ⚠️ **After applying any migration that adds a table, column or RPC, reload the API schema cache.**
> The app reaches Postgres through PostgREST, which caches the schema. Applying migrations through the
> **session pooler** (as above) does **not** reliably trigger the reload, so the API keeps returning
> `PGRST205 "Could not find the table … in the schema cache"` even though the object exists. Fix it
> from a **direct** connection — run this in the **Supabase dashboard → SQL Editor** (not via the pooler):
> ```sql
> notify pgrst, 'reload schema';
> ```
> If it still doesn't refresh, **Settings → General → Restart project**. Verify with a REST call, e.g.
> `curl "$SUPABASE_URL/rest/v1/<new_table>?limit=1" -H "apikey: <publishable key>"` returns `[]`, not `PGRST205`.

## 2. Importers (config-driven, idempotent — swap `teign` for `dart`)
Each fetches open data live, filters to the catchment, and emits SQL piped into the DB.
```bash
cd ~/riverhub/scripts
CFG=../config/catchments/teign.json
for imp in import_shellfish_pas import_bathing_waters import_nature_sites import_sssi import_ogc_areas; do
  echo "=== $imp ==="
  python3 $imp.py --config "$CFG" \
    | docker run --rm -i -e PGPASSWORD="$PGPASSWORD" postgres:16 \
        psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -v ON_ERROR_STOP=1
done
```
| Importer | Designation(s) | Source | SODRP high-priority |
|---|---|---|---|
| `import_shellfish_pas.py` | `shellfish_pa` | EA GeoJSON (bulk, PostGIS clips) | yes |
| `import_bathing_waters.py` | `bathing_water` | EA bwq API (points + classification) | yes |
| `import_nature_sites.py` | `sac` `spa` `ramsar` `mcz` | NE ArcGIS FeatureServers (bbox) | yes |
| `import_sssi.py` | `sssi` | EA OGC API Features (bbox) | yes |
| `import_ogc_areas.py` | `drinking_water_pa` | EA OGC API Features (bbox) | no |

Each importer ends with a `count`/summary line — that's your confirmation.

## 3. Verify
```bash
docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:16 \
  psql -h "$PGHOST" -U "postgres.$PROJECT_REF" -d postgres -p 5432 -c \
  "select designation, count(*) from protected_areas group by designation order by designation;"
```
Teign expectation (approx): `shellfish_pa` 1, `bathing_water` ~12, `sac` 3, `spa` 1, `ramsar` 1,
`mcz` 2, `sssi` ~63, `drinking_water_pa` ~15. (Counts include bbox spillover to the neighbouring
coast — parish pages clip precisely.)

## 4. Surface it
Redeploy the instance's Vercel project (or wait for ISR) so the cached portal pages refresh:
- `/explore/map` → "Protected sites" overlay (polygons + bathing-water points)
- a coastal parish page → "Protected & designated sites" chips (with bathing-water class + SODRP)
- an overflow asset page near the estuary/Dartmoor → amber "Storm Overflows Discharge Reduction Plan
  — high priority" card

## Refresh cadence
- **Bathing waters** re-classify yearly → re-run `import_bathing_waters.py` after each season.
- Designations change rarely; re-run any importer to refresh (idempotent, replaces that org's rows).

## Not yet loaded (see method doc)
- **NVZ** — WMS/bulk only; needs the bulk-download + BNG-filter route.
- **Nutrient-Neutrality catchments** — 0 for Devon; add to `import_ogc_areas.py` LAYERS for an
  NN-affected instance.
