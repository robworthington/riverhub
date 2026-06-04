# River Hub

Water-quality and sewage monitoring platform for **Friends of the Dart**.
This repo is **Milestone 1 (Foundation)** — see `../M1 - Foundation (build spec).md`.

Stack: **Next.js 15** (App Router) · **Supabase** (Postgres + PostGIS, Auth, Storage) · **Tailwind**.

## What M1 includes
- Email/password auth, **admin-invite only** (no public sign-up).
- Single-organisation data model (every row carries `organisation_id` — federation-ready).
- CRUD for **test sites** (parish picker, geolocation, photos), **test results** (mobile-first field entry, chain-of-custody upload), and **test types** (admin-managed).
- Roles: **Admin** (full + invite users + manage test types) and **Volunteer** (field entry + read).
- Seeded reference data: Dart water bodies, 642 Devon/Cornwall civil parishes, two test types (E. coli culture + Petrifilm).

## Local setup

1. **Create a Supabase project** at supabase.com.

2. **Run the schema + seed** (SQL editor or `supabase db push`), in order:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/seed.sql`

3. **Environment** — copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used only by the invite action)
   - `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)

4. **Auth config** in Supabase:
   - Add `${NEXT_PUBLIC_SITE_URL}/accept-invite` to **Redirect URLs**.
   - The invite email template must link with `token_hash` + `type` (default template works).

5. **Bootstrap the first admin** (chicken-and-egg, done once):
   - Auth → Users → **Add user** (with a password), confirm the email.
   - In the SQL editor, insert their profile:
     ```sql
     insert into profiles (id, organisation_id, full_name, role)
     values ('<that-user-uuid>', '00000000-0000-0000-0000-000000000001', 'Your Name', 'admin');
     ```
   - Sign in at `/login`; invite everyone else from **Users**.

6. **Run it**
   ```bash
   npm install
   npm run dev
   ```

## Scripts
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — Next lint

## Notes / follow-ups
- `src/lib/types.ts` is hand-written for M1. Once the project is linked, regenerate with
  `supabase gen types typescript --linked > src/lib/types.ts` and adjust imports.
- Storage reads go through server actions that issue short-lived signed URLs (bucket `evidence` is private).
- Outstanding seed detail (from the build spec): exact Petrifilm `test_code` and precise threshold figures.
- Next milestones: **M2** sewage assets + EDM ingestion, **M3** analysis & maps, **M4** public portal.
