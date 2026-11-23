-- 0095 lock down the national rollup writers.
--
-- refresh_national_rollup() (0093) and assign_river_districts() (0094) are SECURITY DEFINER functions
-- that WRITE (the rollup table; organisations.rbd_id). They were granted to service_role, but Postgres
-- gives EXECUTE on new functions to PUBLIC by default (and Supabase's default privileges add anon and
-- authenticated), so anyone with the public anon key could call them through the REST API. The refresh
-- is a ~30s recompute across every river, so repeated anonymous calls would load the database.
--
-- Only the hourly edm-sync cron calls them, with the service-role client; the public read RPCs never do
-- (refresh_national_rollup calls assign_river_districts as the definer). Revoke everyone else.

revoke execute on function refresh_national_rollup() from public, anon, authenticated;
revoke execute on function assign_river_districts(boolean) from public, anon, authenticated;

grant execute on function refresh_national_rollup() to service_role;
grant execute on function assign_river_districts(boolean) to service_role;

notify pgrst, 'reload schema';
