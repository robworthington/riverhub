-- Phase 1 spike (UK-PLATFORM-SPEC / PHASE-1-PLAN): the first slice of the national, multi-river site.
-- Additive and backward-compatible: the single-org public portal keeps working unchanged; this only
-- ADDS per-river branding columns, a river-lookup RPC, and a river-aware (p_org) overload of
-- public_spills_problems alongside the existing no-arg version. No existing object is removed, so
-- instance-mode deployments and the "apply full sequence -> clean empty instance" property are intact.

-- 1. Per-river branding + slug on organisations (runtime branding; replaces build-time NEXT_PUBLIC_* at scale)
-- NOTE: organisations.slug already exists (migration 0001, unique not null) as the *group* slug
-- (e.g. 'friends-of-the-dart'). A national river chooser wants a pretty, river-facing slug, which is
-- a distinct concept (one group could later steward more than one river), so we add `river_slug`.
alter table organisations add column if not exists river_slug      text;
alter table organisations add column if not exists region          text;
alter table organisations add column if not exists live            boolean not null default true;
alter table organisations add column if not exists river_name      text;
alter table organisations add column if not exists portal_name     text;
alter table organisations add column if not exists company_name    text;
alter table organisations add column if not exists logo_url        text;
alter table organisations add column if not exists marketing_url   text;
alter table organisations add column if not exists donate_url      text;
alter table organisations add column if not exists map_centre_lat  double precision;
alter table organisations add column if not exists map_centre_lng  double precision;
alter table organisations add column if not exists map_zoom        int;
create unique index if not exists organisations_river_slug_uq on organisations (river_slug) where river_slug is not null;

-- Backfill the Friends of the Dart org (FotD-seed; no-op on any DB that lacks this org row).
update organisations set
  river_slug = coalesce(river_slug, 'dart'), region = coalesce(region, 'South West'),
  river_name = coalesce(river_name, 'River Dart'),
  portal_name = coalesce(portal_name, 'River Dart Data'),
  company_name = coalesce(company_name, 'South West Water'),
  logo_url = coalesce(logo_url, '/fod-mark.png'),
  marketing_url = coalesce(marketing_url, 'https://www.friendsofthedart.org'),
  donate_url = coalesce(donate_url, 'https://www.paypal.com/donate/?hosted_button_id=SQ6XYEF4CS37S'),
  map_centre_lat = coalesce(map_centre_lat, 50.45), map_centre_lng = coalesce(map_centre_lng, -3.72),
  map_zoom = coalesce(map_zoom, 11)
where id = '00000000-0000-0000-0000-000000000001';

-- 2. Anon river lookup: resolve a slug to its org id + public branding (security definer; branding is public).
create or replace function public_river(p_slug text)
returns table (
  id uuid, slug text, region text, live boolean, river_name text, portal_name text, company_name text,
  logo_url text, marketing_url text, donate_url text,
  map_centre_lat double precision, map_centre_lng double precision, map_zoom int
)
language sql stable security definer set search_path = public as $$
  select o.id, o.river_slug as slug, o.region, o.live, o.river_name, o.portal_name, o.company_name,
         o.logo_url, o.marketing_url, o.donate_url, o.map_centre_lat, o.map_centre_lng, o.map_zoom
  from organisations o
  where o.river_slug = p_slug and o.live;
$$;
grant execute on function public_river(text) to anon, authenticated;

-- 3. River-aware overload of public_spills_problems(p_org). Body is the 0065 version with the org
--    resolved from the parameter instead of public_org(). The no-arg version is then redefined to
--    delegate to it, so instance mode is unchanged (one source of truth).
--    NOTE: dry_spill_summary() and public_spills_latest_full_year() still resolve the org via
--    public_org() internally — correct where p_org = public_org (single-org DBs, incl. this spike).
--    Parameterising those dependencies is tracked in workstream B (full de-single-org).
create or replace function public_spills_problems(p_org uuid)
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text, system_id uuid, system_name text,
  total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  with org as (select p_org as id),
  lfy as (select public_spills_latest_full_year() as y),
  base as (
    select a.id, a.asset_name, a.asset_unique_id, a.asset_type::text as atype, a.sewage_system_id, a.edm_enabled
    from sewage_assets a where a.organisation_id = (select id from org)
  ),
  spills as (
    select e.asset_id,
      count(*) filter (where e.duration_minutes is null or e.duration_minutes >= 15)::int as total,
      round(sum(coalesce(e.duration_minutes, 0)) filter (
        where extract(year from e.event_start) = (select y from lfy) and (e.duration_minutes is null or e.duration_minutes >= 15)
      ) / 60.0)::int as hours_lfy
    from spill_events e where e.organisation_id = (select id from org) group by e.asset_id
  ),
  ds as (select asset_id, dry from dry_spill_summary(1, 0.25, null, 15)),
  works_days as (
    select a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('sewage_treatment_works', 'storm_tank')
      and (e.duration_minutes is null or e.duration_minutes >= 15)
    group by a.sewage_system_id, e.event_start::date
  ),
  up as (
    select e.asset_id, a.sewage_system_id as sys, e.event_start::date as day
    from spill_events e join sewage_assets a on a.id = e.asset_id
    where a.organisation_id = (select id from org) and a.asset_type in ('combined_sewer_overflow', 'pumping_station')
      and a.asset_name !~ '(^| )STW[_ ]'
      and (e.duration_minutes is null or e.duration_minutes >= 15)
  ),
  pre as (
    select up.asset_id, count(*) filter (where wd.day is null)::int as pre_stw
    from up left join works_days wd on wd.sys = up.sys and wd.day = up.day group by up.asset_id
  ),
  snap as (
    select distinct on (asset_id) asset_id, coalesce(last_updated, captured_at) as lu
    from edm_snapshots where organisation_id = (select id from org) order by asset_id, captured_at desc
  ),
  metrics as (
    select b.id, b.asset_name, b.asset_unique_id, b.atype, b.sewage_system_id, b.edm_enabled,
      coalesce(s.total, 0) as total, coalesce(s.hours_lfy, 0) as hours_lfy,
      coalesce(ds.dry, 0) as dry, coalesce(pre.pre_stw, 0) as pre_stw,
      case when snap.lu is null then null else round(extract(epoch from (now() - snap.lu)) / 3600.0, 1) end as feed_hours,
      exists (
        select 1 from winep_actions w
        where (w.asset_id = b.id or exists (select 1 from winep_asset_links l where l.winep_action_id = w.id and l.asset_id = b.id))
          and (w.completion_date is null or w.completion_date >= current_date)
      ) as has_action
    from base b
    left join spills s on s.asset_id = b.id
    left join ds on ds.asset_id = b.id
    left join pre on pre.asset_id = b.id
    left join snap on snap.asset_id = b.id
  ),
  flags as (
    select m.*,
      case when m.total >= 800 then 5 when m.total >= 400 then 4 else 0 end as w_freq,
      case when m.hours_lfy >= 900 then 5 when m.hours_lfy >= 500 then 4 else 0 end as w_long,
      case when m.dry >= 15 then 5 when m.dry >= 5 then 3 else 0 end as w_dry,
      case when m.pre_stw >= 12 then 5 when m.pre_stw >= 4 then 3 else 0 end as w_prestw,
      case when m.edm_enabled and (m.feed_hours is null or m.feed_hours >= 12) then 2 else 0 end as w_feed
    from metrics m
  )
  select f.id, f.asset_name, f.asset_unique_id, f.atype, f.sewage_system_id, sy.name,
    f.total, f.hours_lfy, f.dry, f.pre_stw, f.feed_hours,
    f.w_freq, f.w_long, f.w_dry, f.w_prestw, f.w_feed,
    (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) as weight, f.has_action
  from flags f left join sewage_systems sy on sy.id = f.sewage_system_id
  order by (f.w_freq + f.w_long + f.w_dry + f.w_prestw + f.w_feed) desc, f.total desc;
$$;
grant execute on function public_spills_problems(uuid) to anon, authenticated;

-- The existing no-arg version now delegates to the p_org one (instance mode unchanged).
create or replace function public_spills_problems()
returns table (
  asset_id uuid, asset_name text, asset_code text, asset_type text, system_id uuid, system_name text,
  total_spills int, hours_lfy int, dry int, pre_stw int, feed_hours numeric,
  w_freq int, w_long int, w_dry int, w_prestw int, w_feed int, weight int, has_action boolean
)
language sql stable security definer set search_path = public as $$
  select * from public_spills_problems((select public_org()));
$$;
grant execute on function public_spills_problems() to anon, authenticated;

notify pgrst, 'reload schema';
