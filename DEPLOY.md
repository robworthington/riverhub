# River Hub — Deployment runbook

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
