-- 0097 national home page roll-up — live counts and the record, precomputed hourly.
--
-- The home page leads with what's happening now (overflows spilling, recently stopped, monitors
-- reporting) and the record (spills before the works, regulator-required actions), alongside the
-- figures the rollup already had. All of them are worked out per river in the hourly
-- refresh_national_rollup() (the edm-sync cron runs it right after syncing the feeds), so the home
-- page, the district pages and the map read one small table:
--   * live counts: the latest snapshot per overflow, about 1 s across ~400k snapshot rows;
--   * spills before the works: the sum of pre_stw from public_spills_problems(), which the refresh
--     already calls, so it costs nothing extra (computing it live took 32 s across 30 rivers).
-- "Stopped in the last 48 h" uses the snapshot's latest_event_end; the river board's per-overflow rule
-- can also use the last granular spill, so the two can differ by a few overflows.

alter table national_river_rollup
  add column if not exists spilling_now    int not null default 0,
  add column if not exists stopped_48h     int not null default 0,
  add column if not exists monitors        int not null default 0,
  add column if not exists reporting       int not null default 0,
  add column if not exists live_as_of      timestamptz,
  add column if not exists pre_stw         int not null default 0,
  add column if not exists winep_actions   int not null default 0,
  add column if not exists winep_due_2030  int not null default 0;

create or replace function refresh_national_rollup()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
begin
  perform assign_river_districts(false);

  insert into national_river_rollup as t
    (org_id, overflows, gaps, dry, hours_lfy, baseline, latest, pre_stw,
     spilling_now, stopped_48h, monitors, reporting, live_as_of, winep_actions, winep_due_2030, refreshed_at)
  select prob.org_id, prob.overflows, prob.gaps, prob.dry, prob.hours_lfy,
         coalesce(red.baseline, 0), coalesce(red.latest, 0), prob.pre_stw,
         coalesce(live.spilling, 0), coalesce(live.stopped, 0), coalesce(live.monitors, 0),
         coalesce(live.reporting, 0), live.as_of,
         coalesce(wp.actions, 0), coalesce(wp.due_2030, 0),
         now()
  from (
    select o.id as org_id,
           count(p.*)::int as overflows,
           count(*) filter (where p.weight > 0 and not p.has_action)::int as gaps,
           coalesce(sum(p.dry), 0)::int as dry,
           coalesce(sum(p.hours_lfy), 0)::int as hours_lfy,
           coalesce(sum(p.pre_stw), 0)::int as pre_stw
    from organisations o
    left join lateral public_spills_problems(o.id) p on true
    where o.river_slug is not null
    group by o.id
  ) prob
  join (
    select o.id as org_id,
           coalesce(sum(rr.baseline), 0)::int as baseline,
           coalesce(sum(rr.latest), 0)::int as latest
    from organisations o
    left join lateral public_spills_reduction(o.id) rr on true
    where o.river_slug is not null
    group by o.id
  ) red using (org_id)
  left join (
    -- Live status from each overflow's latest snapshot. Spilling = monitor says so and has reported in
    -- the last 24 h (the board's rule); reporting = reported within 2 h.
    select l.organisation_id as org_id,
           count(*)::int as monitors,
           count(*) filter (where l.status = 1 and l.last_updated > now() - interval '24 hours')::int as spilling,
           count(*) filter (where coalesce(l.status, 0) <> 1
                              and l.latest_event_end > now() - interval '48 hours'
                              and l.last_updated > now() - interval '24 hours')::int as stopped,
           count(*) filter (where l.last_updated > now() - interval '2 hours')::int as reporting,
           max(l.last_updated) as as_of
    from (
      select distinct on (s.asset_id) s.organisation_id, s.status, s.last_updated, s.latest_event_end
      from edm_snapshots s
      join organisations o on o.id = s.organisation_id and o.river_slug is not null
      order by s.asset_id, s.captured_at desc nulls last
    ) l
    group by l.organisation_id
  ) live using (org_id)
  left join (
    select w.organisation_id as org_id,
           count(*)::int as actions,
           count(*) filter (where w.completion_date <= date '2030-03-31')::int as due_2030
    from winep_actions w
    group by w.organisation_id
  ) wp using (org_id)
  on conflict (org_id) do update set
    overflows      = excluded.overflows,
    gaps           = excluded.gaps,
    dry            = excluded.dry,
    hours_lfy      = excluded.hours_lfy,
    baseline       = excluded.baseline,
    latest         = excluded.latest,
    pre_stw        = excluded.pre_stw,
    spilling_now   = excluded.spilling_now,
    stopped_48h    = excluded.stopped_48h,
    monitors       = excluded.monitors,
    reporting      = excluded.reporting,
    live_as_of     = excluded.live_as_of,
    winep_actions  = excluded.winep_actions,
    winep_due_2030 = excluded.winep_due_2030,
    refreshed_at   = excluded.refreshed_at;

  delete from national_river_rollup x
  where not exists (
    select 1 from organisations o where o.id = x.org_id and o.river_slug is not null
  );

  perform refresh_river_neighbours();
end;
$$;

-- Writers stay service-role only (0095).
revoke execute on function refresh_national_rollup() from public, anon, authenticated;
grant execute on function refresh_national_rollup() to service_role;

-- national_home(): every figure the home page shows, in one row over live rivers. Downstream waters
-- are counted distinct across rivers (two rivers can share a bathing water), so they're computed here
-- rather than summed from the rollup; the importer writes a literal "Not Applicable", excluded.
create or replace function national_home()
returns table(
  rivers integer, overflows integer, gaps integer, dry integer, hours_lfy integer,
  baseline_spills integer, latest_spills integer, pre_stw integer,
  spilling_now integer, rivers_spilling integer, stopped_48h integer, monitors integer, reporting integer,
  live_as_of timestamptz, winep_actions integer, winep_due_2030 integer,
  bathing_waters integer, shellfish_waters integer, overflows_to_bathing integer
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  with live_orgs as (
    select o.id from organisations o where o.live and o.river_slug is not null
  ),
  r as (
    select count(*)::int as rivers,
           coalesce(sum(x.overflows), 0)::int as overflows,
           coalesce(sum(x.gaps), 0)::int as gaps,
           coalesce(sum(x.dry), 0)::int as dry,
           coalesce(sum(x.hours_lfy), 0)::int as hours_lfy,
           coalesce(sum(x.baseline), 0)::int as baseline_spills,
           coalesce(sum(x.latest), 0)::int as latest_spills,
           coalesce(sum(x.pre_stw), 0)::int as pre_stw,
           coalesce(sum(x.spilling_now), 0)::int as spilling_now,
           count(*) filter (where x.spilling_now > 0)::int as rivers_spilling,
           coalesce(sum(x.stopped_48h), 0)::int as stopped_48h,
           coalesce(sum(x.monitors), 0)::int as monitors,
           coalesce(sum(x.reporting), 0)::int as reporting,
           max(x.live_as_of) as live_as_of,
           coalesce(sum(x.winep_actions), 0)::int as winep_actions,
           coalesce(sum(x.winep_due_2030), 0)::int as winep_due_2030
    from live_orgs lo
    left join national_river_rollup x on x.org_id = lo.id
  ),
  w as (
    select count(distinct a.bathing_water) filter (where nullif(trim(a.bathing_water), '') is not null
                                                  and a.bathing_water not ilike 'not applicable%')::int as bathing_waters,
           count(distinct a.shellfish_water) filter (where nullif(trim(a.shellfish_water), '') is not null
                                                    and a.shellfish_water not ilike 'not applicable%')::int as shellfish_waters,
           count(*) filter (where nullif(trim(a.bathing_water), '') is not null
                              and a.bathing_water not ilike 'not applicable%')::int as overflows_to_bathing
    from sewage_assets a
    join live_orgs lo on lo.id = a.organisation_id
  )
  select r.*, w.* from r, w;
$function$;

-- national_rivers() gains each river's live counts (for the map dots and the "spilling now" list).
drop function if exists national_rivers(text);

create or replace function national_rivers(p_district text default null)
returns table(
  slug text, river_name text, region text, org_name text,
  overflows integer, gaps integer, dry integer, hours_lfy integer, logo_url text,
  company_name text, district_slug text, district_name text, lat double precision, lng double precision,
  spilling_now integer, stopped_48h integer
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select o.river_slug, o.river_name, o.region, o.name,
         coalesce(x.overflows, 0),
         coalesce(x.gaps, 0),
         coalesce(x.dry, 0),
         coalesce(x.hours_lfy, 0),
         o.logo_url,
         o.company_name,
         d.slug, d.name,
         coalesce(o.map_centre_lat, c.lat),
         coalesce(o.map_centre_lng, c.lng),
         coalesce(x.spilling_now, 0),
         coalesce(x.stopped_48h, 0)
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  left join river_basin_districts d on d.id = o.rbd_id
  left join lateral (
    select avg(a.latitude)::double precision as lat, avg(a.longitude)::double precision as lng
    from sewage_assets a where a.organisation_id = o.id and a.latitude is not null
  ) c on true
  where o.live and o.river_slug is not null
    and (p_district is null or d.slug = p_district)
  order by coalesce(x.gaps, 0) desc, o.river_name;
$function$;

-- national_district_shapes(): every district's outline (simplified for an England-scale map), a label
-- point, and its live totals, for the home page map. Uncovered districts come back with rivers = 0.
create or replace function national_district_shapes()
returns table(
  slug text, name text, rivers integer, spilling_now integer, gaps integer, dry integer,
  lat double precision, lng double precision, boundary text
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
  select d.slug, d.name,
         count(o.id)::int,
         coalesce(sum(x.spilling_now), 0)::int,
         coalesce(sum(x.gaps), 0)::int,
         coalesce(sum(x.dry), 0)::int,
         ST_Y(ST_PointOnSurface(d.geom)),
         ST_X(ST_PointOnSurface(d.geom)),
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.geom, 0.008), 3)
  from river_basin_districts d
  left join organisations o on o.rbd_id = d.id and o.live and o.river_slug is not null
  left join national_river_rollup x on x.org_id = o.id
  where d.geom is not null
  group by d.id, d.slug, d.name, d.geom
  order by d.name;
$function$;

grant execute on function national_home() to anon, authenticated;
grant execute on function national_rivers(text) to anon, authenticated;
grant execute on function national_district_shapes() to anon, authenticated;

notify pgrst, 'reload schema';
