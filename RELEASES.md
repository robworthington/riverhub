# Releases & instance upgrades

*Federation workstream F5. The template is released by tag; instances upgrade by release, never
by tracking `main` — a half-finished feature must never land on a live group.*

## Versioning

Semantic-ish: **vMAJOR.MINOR.PATCH**.
- **PATCH** — fixes, copy, perf; no schema change.
- **MINOR** — features and/or additive migrations (the common case).
- **MAJOR** — breaking changes to instance config, env vars, or data semantics (anything that
  makes the upgrade more than the standard procedure below).

`v1.0.0` = the federation-ready baseline (M1–M4 complete + F1–F4: org-agnostic schema,
instance config layer, catchment orchestrator, provisioning runbook). The FotD production
instance runs this.

## Cutting a release

1. `main` green: `npm run typecheck && npm run build` clean; new migrations applied + verified
   on the FotD instance (it is federated-instance #1 and the de-facto staging environment).
2. Update this file's history table; tag and push:
   `git tag -a vX.Y.Z -m "<one-line summary>" && git push origin vX.Y.Z`
3. Release notes (tag message or GitHub Release): user-facing changes, **new migrations**,
   **new/changed env vars**, any manual steps.

## Upgrading an instance

For each instance in the registry (per `PROVISIONING.md` §8):

```bash
git fetch --tags && git checkout vX.Y.Z
# apply only migrations newer than the instance's current release:
for f in supabase/migrations/<new ones, in order>; do
  docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 -q < "$f"
done
docker run --rm -i postgres:16 psql "$DB_URL" -c "notify pgrst, 'reload schema';"
# deploy: point the instance's Vercel project at the tag (or promote the build), then
# re-run the portal checks from PROVISIONING.md §7. Record the release in the registry.
```

Migrations are append-only and idempotent-by-guard; applying the full sequence to any instance
is always safe. Set any env vars the release notes name **before** deploying (NEXT_PUBLIC_* are
build-time).

## Repo hygiene (open-source)

Licensed **AGPL-3.0** (`LICENSE`; decision 3 in the Federation plan). History audited clean
before publication — no credentials, tokens or `.env` files were ever committed; keep it that
way: secrets live only in Vercel env and the private instance registry. Catchment configs in
`config/catchments/` are public by design (open data identifiers, not secrets).

## History

| Release | Date | Notes |
|---|---|---|
| v1.0.0 | 2026-06-11 | Federation-ready baseline: members app (M1–M3), public portal (M4), workstream F1–F5 (org-agnostic schema, instance config, catchment orchestrator, provisioning runbook, AGPL licence) |
