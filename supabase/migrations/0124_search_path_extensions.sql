-- 0124: let pinned functions find PostGIS in the extensions schema.
--
-- PostGIS sits in public, which the Security Advisor flags (spatial_ref_sys and friends are owned by
-- supabase_admin, so we can't enable RLS on them or revoke the anon/authenticated grants). Supabase
-- Support's fix (Nov 2026) is to move PostGIS to the extensions schema, in place.
--
-- After that move, any function pinned to `search_path = public` would stop resolving geometry,
-- geography and ST_* (about 60 of ours use them: the map, spill pages, outlines, classify_spills).
-- This adds extensions to every such function's search path. While PostGIS is still in public it
-- changes nothing, so it is safe to apply before the move.
--
-- ALTER FUNCTION ... SET search_path replaces only that setting; statement_timeout, jit and other
-- per-function settings stay as they are. Functions owned by an extension are left alone.
--
-- FROM NOW ON: write `set search_path = public, extensions` in new or replaced functions. A
-- `create or replace` with `set search_path = public` would undo this for that function.

do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind in ('f', 'p')
      and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s set search_path = public, extensions', f.sig);
    n := n + 1;
  end loop;
  raise notice '0124: % functions now use search_path = public, extensions', n;
end $$;
