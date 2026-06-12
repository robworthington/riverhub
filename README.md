# River Hub

**An open platform for community river monitoring** — water-quality sampling, sewage-spill
tracking and catchment analysis, built for citizen-science groups in England.

Developed for and with **[Friends of the Dart](https://www.friendsofthedart.org)** (River Dart,
Devon), whose public data portal runs on it. The platform is a **federated template**: each
group runs its own instance, configured for its catchment, from this one codebase.

## What it does

**Members app** (login-gated):
- Field entry for water-quality samples (mobile-first, photos, chain-of-custody), sites and
  test types; roles: admin / volunteer / read-only viewer.
- **Automated sewage-spill tracking**: hourly sync of the water company's live storm-overflow
  EDM feed, plus EA Annual Return history; spills classified **dry vs wet** against local
  rainfall — dry-weather spills usually indicate a fault.
- EA rainfall + river-flow ingestion, treatment-works capacity vs estimated demand (permit +
  EIR + Census-population based), analysis dashboards, layered pollution maps (parish/district
  choropleths, coloured river stretches), Excel export.
- Bathing-water classification (EA log-normal percentile method) per site.

**Public portal** (anonymous, on the group's `data.<domain>`):
pollution map, per-site water-quality history, sewage-spill tables, council (district/parish)
pages — fed only by curated anon-safe RPCs (no personal data, no internal notes).

## Stack

**Next.js 15** (App Router) · **Supabase** (Postgres + PostGIS, Auth, Storage) · **Tailwind** ·
Leaflet · Recharts. Deployed on Vercel (incl. the sync cron). Data importers are dependency-free
Python 3 (+ `openpyxl`).

## Repository layout

| Path | What |
|---|---|
| `src/` | The app (members + public portal) |
| `supabase/migrations/` | Versioned schema — see `MANIFEST.md` for schema vs data migrations |
| `scripts/` | Catchment importers + `setup_catchment.py` orchestrator |
| `config/catchments/` | Per-catchment definitions (`dart.json` is the reference) |
| `PROVISIONING.md` | **Stamp a new group's instance** (the federation runbook) |
| `DEPLOY.md` | Original FotD deployment record + schema-change pattern |
| `RELEASES.md` | Release & instance-upgrade discipline |
| `*-METHOD.md` | Methodology notes (catchment import, dry-spill classification, population/capacity) |

## Running locally

1. Supabase project (hosted or `supabase start`): apply `supabase/migrations/0*.sql` in order,
   then `supabase/seed.sql`.
2. `cp .env.example .env.local` and fill in the Supabase URL/keys; instance branding is env-driven
   (see `src/lib/instance.ts`) and defaults to Friends of the Dart.
3. Bootstrap the first admin (Supabase Auth → Add user with auto-confirm, then insert their
   `profiles` row — exact SQL in `PROVISIONING.md` §4).
4. `npm install && npm run dev`. Useful: `npm run typecheck`, `npm run build`.

To load a real catchment's data (boundaries, assets, spill history, gauges, rivers):
`python3 scripts/setup_catchment.py --config config/catchments/dart.json --db "$DB_URL"`.

## Federation

Each group = its own instance (own database, own deployment) stamped from this template; the
centre maintains the template, the national data connectors and the methodology. See
`PROVISIONING.md`. Opt-in pooling of aggregated data across groups is a planned, later layer.

## Licence

[GNU AGPL-3.0](LICENSE). You may use, study, modify and redistribute this software; if you run a
modified version — including as a hosted service — you must make your modified source available
to its users. Chosen deliberately: the methodology behind published water-quality claims should
stay inspectable, and improvements should flow back to the commons.
