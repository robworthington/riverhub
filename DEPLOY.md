# River Hub — Deployment runbook

> **Provisioning a new group's instance?** Use **`PROVISIONING.md`** — the federation runbook
> (instance config, catchment setup orchestrator, registry). This file is the original FotD
> deployment record and the general schema-change/redeploy pattern.

Target: **Supabase (hosted Postgres/Auth/Storage)** + **Vercel (Next.js + cron)**.
Repo: `robworthington/riverhub`.

## 0. Order of operations
1. Provision Supabase (DB + auth + storage) and load schema/seed.
2. Deploy to Vercel with env vars.
3. Point Supabase Auth redirect at the Vercel domain.
4. Bootstrap the first admin; smoke-test.

---

## 1. Supabase (hosted)

**Create project** (dashboard → New project) — note the **project ref**, **region**, and **DB password**.

**Apply schema** — from `river-hub/`:
```bash
npx supabase login                      # paste a personal access token
npx supabase link --project-ref <REF>   # enter DB password
npx supabase db push                    # applies migrations 0001–0006
```

**Load seed + boundaries** (remote SQL — migrations don't auto-run seeds). Using the pooled connection string from Supabase → Settings → Database:
```bash
# psql via a throwaway container (no local psql needed):
docker run --rm -i postgres:16 psql "$DB_URL" < supabase/seed.sql
docker run --rm -i postgres:16 psql "$DB_URL" < supabase/seed_boundaries.sql
```
This seeds: Friends of the Dart org, 7 Dart water bodies, 642 parishes (+ 63 Dart-area boundary polygons), 2 test types, the real River Dart CSO (SBB00885), and the Austins Bridge + Holne Priddons Farm EA stations. *(No demo test results — production starts clean.)*

**Get keys** — Supabase → Settings → API: copy **Project URL**, **anon key**, **service_role key**.

---

## 2. Vercel

Import `robworthington/riverhub` (root = repo root, framework auto-detected: Next.js).

**Environment variables** (Production):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server-only) |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://riverhub.vercel.app` |
| `CRON_SECRET` | `540990cec5198a2f4b6b831329ea45252e6c8df8c36b047b` |

Deploy. The daily cron (`vercel.json` → `/api/cron/edm-sync`, `0 6 * * *`) is registered automatically and Vercel sends `Authorization: Bearer $CRON_SECRET`.

---

## 3. Supabase Auth config
Supabase → Authentication → URL configuration:
- **Site URL**: your Vercel URL.
- **Redirect URLs**: add `https://<your-vercel-url>/accept-invite`.
- Email templates: default invite template works (uses `token_hash`).

> For real invite emails, configure SMTP (Supabase → Auth → SMTP). Without it, invites are rate-limited/sandboxed.

---

## 4. Bootstrap first admin
Auth → Users → Add user (email + password, auto-confirm). Then in the SQL editor:
```sql
insert into profiles (id, organisation_id, full_name, role)
values ('<new-user-uuid>', '00000000-0000-0000-0000-000000000001', 'Your Name', 'admin');
```
Sign in at `/login`; invite the rest from **Users**.

---

## 5. Smoke test
- `/login` → sign in as admin.
- `/assets` → **Sync EDM now** → River Dart CSO pulls live status.
- `/environment` → **Sync rainfall/flow** → EA readings load.
- `/heatmap`, `/map`, `/analysis` render.
- Trigger cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://<url>/api/cron/edm-sync`.

## Notes
- Cron on Vercel Hobby runs once/day (our schedule fits).
- `vercel.json` already configures the cron; no extra setup.
- To refresh boundaries or extend coverage, re-run `seed_boundaries.sql` (idempotent) or regenerate it for a wider bounding box.

---

## 6. Shipping a schema change + redeploy (general pattern)

Use this whenever a change adds a migration (e.g. `0012_system_capacity.sql`). **Golden rule: apply the database change to prod BEFORE pushing to GitHub** — Vercel auto-deploys on push, and the new app code will error if its tables/views aren't there yet.

### Where each thing happens
| Step | Where you do it |
|------|-----------------|
| Get the DB password | **Supabase dashboard** → project `srxibtugcaojjleuspct` → Settings → Database |
| Create a GitHub token | **GitHub website** → Settings → Developer settings → Fine-grained tokens (Contents: Read/Write on `robworthington/riverhub`) |
| Run migration + importer | **Your Mac terminal**, inside `river-hub/` (dockerised `psql`, no local psql needed) |
| `git push` | **Your Mac terminal**, inside `river-hub/` |
| Watch the build | **Vercel dashboard** → riverhub → Deployments |
| Final smoke test | **Browser** at `https://riverhub.vercel.app` |

### Step A — set the prod connection string *(terminal, in `river-hub/`)*
Use the **session pooler** host; the direct `db.<ref>` host is IPv6-only and unreachable here.
```bash
cd "/Users/robertworthington/Documents/Claude/Projects/River Hub/river-hub"
DB_URL="postgresql://postgres.srxibtugcaojjleuspct:<PASSWORD>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
```

### Step B — apply the migration *(terminal)*
```bash
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 \
  < supabase/migrations/0012_system_capacity.sql
```
Expect `CREATE TABLE / CREATE POLICY / ALTER TABLE / CREATE VIEW / CREATE FUNCTION / GRANT`. Any error → stop.

### Step C — load ONS population data *(terminal)*
Re-runs are safe (idempotent upserts that preserve admin-tuned G / low / high / override). Relies on the 63 Dart parish boundaries already in prod.
```bash
python3 scripts/estimate_system_population.py > /tmp/system_pop.sql   # stderr: ~622 OAs, 622/622 matched
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 < /tmp/system_pop.sql
# verify:
docker run --rm -i postgres:16 psql "$DB_URL" -c \
"select sy.name, v.effective_population, v.demand_central_m3d
   from system_capacity_v v join sewage_systems sy on sy.id=v.system_id
  order by v.effective_population desc nulls last limit 5;"
```

### Step D — push (auto-deploys Vercel) *(terminal)*
```bash
git push "https://x-access-token:<TOKEN>@github.com/robworthington/riverhub.git" main
```
Commit author must be `robworthington <14218079+robworthington@users.noreply.github.com>` or Vercel blocks the build with "commit email could not be matched."

### Step E — verify *(Vercel dashboard, then browser)*
Wait for **Ready** in Vercel → open the live app → **Sewage → Systems → a system** → the **Population & capacity** panel shows the demand range; as admin, **Edit assumptions** saves and **Refresh from ONS** repopulates.

> **Secrets:** `<PASSWORD>` / `<TOKEN>` live only in your shell — never commit them. After deploying: `unset DB_URL` (and clear shell history if desired).

---

## 7. Importing the Friends of the Dart water-quality data

Loads testing sites + lab results from the FoD Google Sheet (samples + locations tabs) and powers the
**Dashboards → Analysis** charts. Migration `0013` adds the site/result fields and the intestinal
enterococci test type; `scripts/import_water_quality.py` fetches both tabs and emits idempotent SQL.

The code (charts) ships with a normal `git push` (Vercel auto-deploys). The two DB steps below are
done **in your Mac terminal, inside `river-hub/`**, using the same prod `DB_URL` as §6 Step A.
Re-running the importer is the "refresh from the sheet" — safe and idempotent (results dedupe on a
deterministic `source_ref`; sites match on name).

```bash
cd "/Users/robertworthington/Documents/Claude/Projects/River Hub/river-hub"
DB_URL="postgresql://postgres.srxibtugcaojjleuspct:<PASSWORD>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
```

### Step 1 — apply the schema migrations *(terminal)*
```bash
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 \
  < supabase/migrations/0013_water_quality_import.sql
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 \
  < supabase/migrations/0014_sample_weather_cso.sql
```
0013 adds site/result fields + the intestinal enterococci type; 0014 adds the weather + CSO-release
columns the importer populates. Expect `ALTER TABLE … CREATE INDEX … INSERT/UPDATE`. Any error → stop.

### Step 2 — import sites + results *(terminal)*
Needs internet (fetches the public Google Sheet) and the 63 Dart parish boundaries already in prod
(loaded with `seed_boundaries.sql`).
```bash
python3 scripts/import_water_quality.py > /tmp/wq.sql
# stderr should report ~40 locations, 951 sample rows, ~92 sites (≈39 geolocated), ~1375 results, 0 skipped
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 < /tmp/wq.sql
# verify:
docker run --rm -i postgres:16 psql "$DB_URL" -c \
"select tt.test_name, count(*) from test_results r join test_types tt on tt.id=r.test_type_id
   where r.source='fod_sheet' group by 1 order by 2 desc;"
```

### Verify in the app *(browser)*
**Dashboards → Analysis** → pick a Test type (E. coli culture / Petrifilm / Intestinal enterococci):
the log-scale chart shows the samples with the red EA reference line, and the stat cards show the
exceedance count and % over. Sites appear under **Water quality → Sites** with parish + coordinates.

> Sites whose sheet label couldn't be geolocated are imported **without coordinates** (and so without
> a parish) — add lat/long by editing the site. Re-running Step 2 will then auto-assign their parish.
