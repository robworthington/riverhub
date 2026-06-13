# River Hub — new-instance provisioning runbook

*Federation workstream F4. How the centre stamps a new group's instance from this template.
Per the Federation plan decisions: the **centre** performs every step, both cloud projects live
under the **central umbrella accounts**, and the group's only technical contribution is two DNS
records. Target: a working, empty instance in ~half a day, plus the catchment data load.*

*`DEPLOY.md` remains the original FotD deployment record and the general schema-change pattern;
this runbook supersedes it for provisioning new instances.*

---

## 0. Inputs and prerequisites

**From the group** (a short intake conversation):

| Input | Example (FotD) | Used for |
|---|---|---|
| Group name | Friends of the Dart | `NEXT_PUBLIC_ORG_NAME`, org row |
| River / catchment name | River Dart | `NEXT_PUBLIC_RIVER_NAME`, prose |
| Portal title | River Dart Data | `NEXT_PUBLIC_PORTAL_NAME` |
| Marketing site URL | friendsofthedart.org | portal links |
| Domain for the portal | data.friendsofthedart.org | the `data.<group>.org` standard |
| County | Devon | parish records |
| First admin's email | — | bootstrap user |
| Historical sampling data? | spreadsheets, if any | step 7 (optional — spills-only instances are valid) |

**Tools on the provisioning machine:** Docker (for `psql` via the `postgres:16` image — or a local
`psql`), Python 3 + `openpyxl`, Node 20+, git. Access to the central Supabase org and Vercel team.

---

## 1. Define the catchment

Create `config/catchments/<slug>.json` (copy `dart.json` and replace every value):

- **`wfd.wb_ids`** — the WFD river water-body ids for the catchment. Find them in the
  [EA Catchment Data Explorer](https://environment.data.gov.uk/catchment-planning/): navigate to
  the river's *operational catchment* → list the river water bodies (ids look like `GB1080…`).
  Which tributaries to include is a judgement call — agree the scope with the group.
- **`wfd.estuary_opcat_id`** — if the catchment has an estuary, the *transitional* operational
  catchment id (the numeric id in the Catchment Data Explorer URL). Omit/null for non-tidal rivers.
- **`geo.bbox`** — `[south, west, north, east]` enclosing the catchment with a small margin
  (eyeball it on the Catchment Data Explorer map). Drives parishes, rivers, population.
- **`geo.centre` / `geo.radius_km`** — catchment centroid; radius for rain-gauge discovery.
- **`company.edm_feed`** — the water company's live storm-overflow ArcGIS endpoint. Known feeds
  are kept in the table below (the water-company registry, workstream F7):

  | Company | EDM outlets feed |
  |---|---|
  | South West Water | `https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0/query` |
  | *(others)* | *add when first needed — every English WaSC publishes an equivalent feed* |

- **`company.annual_sheet_match`** — the company's sheet-name prefix in the EA EDM Annual Return
  workbook (e.g. "South West Water").

Commit the new config to the template repo — catchment definitions are shared knowledge, not
secrets.

## 2. Supabase project

1. Create a project in the central Supabase org. Region **London (`eu-west-2`)**. Generate and
   record a strong DB password.
2. From **Settings → Database → Connection string → Session pooler**, record the URI (the
   `…pooler.supabase.com:5432` form — the direct `db.…` host is IPv6-only and often unreachable).
   Export it for this session: `export DB_URL='postgresql://postgres.<ref>:<pw>@…:5432/postgres'`
3. From **Settings → API**, record the project URL, `anon` key, and `service_role` key.
4. **Apply all migrations in order** (the data inserts in early migrations are org-guarded and
   no-op on an empty database — apply the full sequence verbatim, see
   `supabase/migrations/MANIFEST.md`):

   ```bash
   cd river-hub
   for f in supabase/migrations/0*.sql; do
     echo "== $f"
     docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 -q < "$f" || break
   done
   ```
5. **Seed the organisation + config** (new uuid per instance — never reuse another instance's):

   ```bash
   docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
   insert into organisations (id, name, slug)
     values (gen_random_uuid(), '<Group Name>', '<slug>') returning id;
   insert into app_config (public_org) select id from organisations;
   SQL
   ```
   Record the returned org id — it goes in the catchment config (`org_id`) and the registry.
6. **Auth settings** (Dashboard → Authentication → URL Configuration): Site URL = the Vercel
   production URL for now (update after DNS); add `https://<domain>/**` to Redirect URLs once known.

## 3. Vercel project

Create a project in the central Vercel team from the template repo (deploy from `main` or the
current release tag). Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL from step 2.3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server-only; invite flow) |
| `CRON_SECRET` | fresh random string (`openssl rand -hex 24`) — authorises the hourly sync cron |
| `NEXT_PUBLIC_ORG_NAME` | group name |
| `NEXT_PUBLIC_PORTAL_NAME` | portal title |
| `NEXT_PUBLIC_RIVER_NAME` | river name |
| `NEXT_PUBLIC_MARKETING_URL` | group's site, with `https://` |
| `NEXT_PUBLIC_MAP_CENTRE` | `"lat,lng"` (= `geo.centre`) |
| `NEXT_PUBLIC_MAP_ZOOM` | usually `11` |
| `NEXT_PUBLIC_SITE_URL` | `https://data.<group>.org` (set now; harmless pre-DNS) |
| `RESEND_API_KEY` / `RESEND_FROM` | optional — branded invite email (else Supabase's built-in) |

Deploy. The hourly cron (`vercel.json` → `/api/cron/edm-sync`) activates automatically and runs
**both** the EDM spill sync and the EA rainfall/flow pulls; it is a safe no-op until assets and
gauges exist.

## 4. First admin

No email infrastructure is needed:

1. Supabase Dashboard → Authentication → Users → **Add user → Create new user**: the admin's
   email + a strong temporary password, **tick "Auto Confirm User"**.
2. Grant the profile:

   ```bash
   docker run --rm -i postgres:16 psql "$DB_URL" <<'SQL'
   insert into profiles (id, organisation_id, full_name, role, active)
   select u.id, (select public_org from app_config), '<Full Name>', 'admin', true
   from auth.users u where lower(u.email) = '<email>'
   on conflict (id) do update set role = 'admin', active = true;
   SQL
   ```
3. Share the password out-of-band; they should change it after first login. All further users are
   invited through the app (Admin → Users).

## 5. Domain

1. Vercel project → Domains → add `data.<group>.org` (the standard; the hostname middleware keys
   on the `data.` prefix — no code change). Optionally also the members-app domain.
2. Send the group the CNAME record(s) Vercel shows — **this is the only step the group performs.**
3. When DNS resolves: confirm `NEXT_PUBLIC_SITE_URL` is the portal domain, redeploy, and update
   the Supabase Auth Site URL / Redirect URLs (step 2.6).

## 6. Load the catchment data

```bash
export CATCHMENT_CONFIG=config/catchments/<slug>.json
python3 scripts/setup_catchment.py --config $CATCHMENT_CONFIG --db "$DB_URL"
```

Runs parishes → water-bodies → assets → assign → population → edm → gauges → rivers, each
idempotent with a per-step verification count. **No files to download** — every step fetches from
live open-data services. Step-specific notes:

- **assets** + **edm** both source from the EA all-years EDM FeatureServer (assets: type/permit/site
  enrichment of the live outlet feed; edm: historical annual spill stats). No spreadsheet needed.
- **rivers** hits OSM Overpass — occasionally slow/rate-limited; just re-run if it fails.
- **ea-backfill** (historical rainfall/flow) is skipped by default; run later with
  `--only ea-backfill` and `EA_FROM=2021-01-01` if the group wants history.
- River **flow gauges** (vs rain gauges) are registered per-catchment in the app/DB — pick EA
  stations on the river's main stem (see `DEPLOY.md` notes).

**Manual follow-ups** (cannot be orchestrated): the group's historical water-quality spreadsheets
(adapt `import_water_quality.py` — column mapping is per-source), site geocoding stragglers,
permit/EIR capacity data, asset↔water-body sanity check (`assign_asset_water_bodies.py`).

## 7. Smoke test

- [ ] Admin can log in; deactivated/unknown users cannot.
- [ ] Create a test site + test result; both visible; delete them.
- [ ] Map / heatmap pages render (parish boundaries + river stretches present).
- [ ] Assets list populated; open one asset — EDM annual history shows.
- [ ] Trigger the cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/edm-sync` → `{"ok":true,…}`; spot-check `edm_snapshots` has fresh rows.
- [ ] `/explore` renders with live stats; pollution map shows river stretches; a site page opens.
- [ ] Spills-only instance: `/explore` hero shows the spills/councils CTAs instead of map/sites.
- [ ] `robots.txt` is `text/plain`, `sitemap.xml` is `application/xml` with instance URLs.
- [ ] Public RPCs respond under the anon timeout (the portal pages *are* this test).
- [ ] On the portal domain: `/` serves the portal; `/dashboard` redirects to `/explore`.

## 8. Registry entry

Append to the central instance registry (private — not in this repo):

```
group:            <name>            slug: <slug>
org_id:           <uuid>
supabase ref:     <ref>             region: eu-west-2
vercel project:   <name>
domains:          data.<group>.org  (members: <domain or vercel url>)
release deployed: <tag/commit>
admin contact:    <name/email>
catchment config: config/catchments/<slug>.json
provisioned:      <date> by <who>
notes:            <spills-only? data sources? quirks>
```

## 9. Upgrades

Per release (workstream F5): `git pull` the release tag → apply any **new** migrations to the
instance DB (same loop as step 2.4 — all migrations are idempotent-by-guard or additive) →
redeploy the Vercel project → re-run the smoke test's portal checks. Record the new release in
the registry.

## 10. Troubleshooting (gotchas this project actually hit)

| Symptom | Cause / fix |
|---|---|
| `psql: could not translate host name "db.…supabase.co"` | Direct-connection host is IPv6-only — use the **Session pooler** URI |
| Vercel build fails `Invalid URL` at metadata collection | A malformed `NEXT_PUBLIC_SITE_URL`-style env value; the resolver now ignores junk, but check env values are real URLs |
| Public portal section renders empty but members app fine | The anon role has `statement_timeout=3s` — a public RPC is too slow. Test with `set statement_timeout='3s'` in psql (a plain `set role anon` does **not** apply the API timeout) |
| New/changed RPC 404s from the app | PostgREST schema cache — `notify pgrst, 'reload schema';` |
| Branding/env change has no effect | `NEXT_PUBLIC_*` vars are inlined at **build** time — redeploy, don't just restart |
| Supabase linter: `spatial_ref_sys` RLS advisory | PostGIS-owned table; cannot be altered — dismiss it. Do **not** revoke grants (breaks geography ops) |
| Overpass timeouts during `rivers` | Re-run; the script rotates three endpoints and the load is idempotent |
