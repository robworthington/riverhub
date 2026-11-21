-- Phase 4 (national) fix — the national landing page's two rollups, national_summary() and
-- national_rivers(), aggregate every org's full spill history via LATERAL public_spills_problems()/
-- public_spills_reduction() per org. Warm they run ~1.5s (rivers) and ~2.2s (summary), but the anon
-- role's statement_timeout is 3s, so cold or under load they exceed it and PostgREST returns 500 —
-- which the public data layer renders as an empty/stale national page (only the build-time
-- prerender's rivers show). Raise the per-function statement_timeout for just these two SECURITY
-- DEFINER functions so they always run to completion; they sit behind the page's 10-minute ISR cache,
-- so they execute rarely. (A function-local statement_timeout extends the deadline for the whole
-- function, nested calls included, without widening the 3s limit for any other anon query.)
--
-- Instance deployments never call these (national mode only), so this is harmless on release-v1.
alter function national_summary() set statement_timeout = '30s';
alter function national_rivers()  set statement_timeout = '30s';
