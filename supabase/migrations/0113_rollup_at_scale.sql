-- 0113 — National rollup refresh that scales to every English river (ENGLAND-ROLLOUT-PLAN.md Phase 0.5).
--
-- refresh_national_rollup() recomputed every figure for every river each hour. At 30 rivers it took
-- ~22 s (public_spills_problems 9.9 s, public_spills_reduction 7.6 s, live counts 3.1 s); at ~340 it
-- would take minutes, past the hourly cron's 60 s and the 30–120 s statement timeouts. Split by how
-- often each part changes:
--   * refresh_national_live(): spilling now / stopped / monitors / reporting for every river, from each
--     overflow's latest snapshot (one index lookup per overflow). Hourly, all rivers.
--   * refresh_national_record(p_limit, p_org): overflows, gaps, dry spills, hours, reduction, spills
--     before the works and WINEP counts, which only change when data is loaded. The hourly cron does
--     the p_limit least-recently-refreshed rivers, so every river is refreshed about daily; after
--     loading a river, refresh it straight away with refresh_national_record(1, '<org id>').
--   * refresh_national_rollup() stays as the full refresh (both), for manual use after a big batch.

alter table national_river_rollup
  add column if not exists live_refreshed_at   timestamptz,
  add column if not exists record_refreshed_at timestamptz;
update national_river_rollup
   set live_refreshed_at = coalesce(live_refreshed_at, refreshed_at),
       record_refreshed_at = coalesce(record_refreshed_at, refreshed_at);

create or replace function refresh_national_live() returns integer
language plpgsql security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare n integer;
begin
  insert into national_river_rollup as t
    (org_id, monitors, spilling_now, stopped_48h, reporting, live_as_of, live_refreshed_at, refreshed_at)
  select o.id,
         count(l.*)::int,
         count(*) filter (where l.status = 1 and l.last_updated > now() - interval '24 hours')::int,
         count(*) filter (where coalesce(l.status, 0) <> 1
                            and l.latest_event_end > now() - interval '48 hours'
                            and l.last_updated > now() - interval '24 hours')::int,
         count(*) filter (where l.last_updated > now() - interval '2 hours')::int,
         max(l.last_updated),
         now(), now()
  from organisations o
  left join sewage_assets a on a.organisation_id = o.id
  -- each overflow's latest snapshot, via the (asset_id, captured_at desc) index
  left join lateral (
    select s.status, s.last_updated, s.latest_event_end
    from edm_snapshots s where s.asset_id = a.id
    order by s.captured_at desc limit 1
  ) l on true
  where o.river_slug is not null
  group by o.id
  on conflict (org_id) do update set
    monitors          = excluded.monitors,
    spilling_now      = excluded.spilling_now,
    stopped_48h       = excluded.stopped_48h,
    reporting         = excluded.reporting,
    live_as_of        = excluded.live_as_of,
    live_refreshed_at = excluded.live_refreshed_at,
    refreshed_at      = excluded.refreshed_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- `monitors` above counts every overflow with a snapshot row (count(l.*) skips overflows with none),
-- matching the previous definition (overflows that have ever reported).

create or replace function refresh_national_record(p_limit integer default 12, p_org uuid default null) returns integer
language plpgsql security definer set search_path to 'public' set statement_timeout to '120s' as $$
declare r record; n integer := 0;
begin
  perform assign_river_districts(false);
  for r in
    select o.id
    from organisations o left join national_river_rollup x on x.org_id = o.id
    where o.river_slug is not null and (p_org is null or o.id = p_org)
    order by x.record_refreshed_at nulls first, o.id
    limit case when p_org is null then greatest(p_limit, 0) else 1 end
  loop
    insert into national_river_rollup as t
      (org_id, overflows, gaps, dry, hours_lfy, baseline, latest, pre_stw, winep_actions, winep_due_2030,
       record_refreshed_at, refreshed_at)
    select r.id, prob.overflows, prob.gaps, prob.dry, prob.hours_lfy,
           red.baseline, red.latest, prob.pre_stw, wp.actions, wp.due_2030, now(), now()
    from (select count(p.*)::int as overflows,
                 count(*) filter (where p.weight > 0 and not p.has_action)::int as gaps,
                 coalesce(sum(p.dry), 0)::int as dry,
                 coalesce(sum(p.hours_lfy), 0)::int as hours_lfy,
                 coalesce(sum(p.pre_stw), 0)::int as pre_stw
          from public_spills_problems(r.id) p) prob,
         (select coalesce(sum(rr.baseline), 0)::int as baseline, coalesce(sum(rr.latest), 0)::int as latest
          from public_spills_reduction(r.id) rr) red,
         (select count(*)::int as actions,
                 count(*) filter (where w.completion_date <= date '2030-03-31')::int as due_2030
          from winep_actions w where w.organisation_id = r.id) wp
    on conflict (org_id) do update set
      overflows           = excluded.overflows,
      gaps                = excluded.gaps,
      dry                 = excluded.dry,
      hours_lfy           = excluded.hours_lfy,
      baseline            = excluded.baseline,
      latest              = excluded.latest,
      pre_stw             = excluded.pre_stw,
      winep_actions       = excluded.winep_actions,
      winep_due_2030      = excluded.winep_due_2030,
      record_refreshed_at = excluded.record_refreshed_at,
      refreshed_at        = excluded.refreshed_at;
    n := n + 1;
  end loop;

  delete from national_river_rollup x
  where not exists (select 1 from organisations o where o.id = x.org_id and o.river_slug is not null);
  perform refresh_river_neighbours();
  return n;
end $$;

-- The full refresh, for manual use (e.g. after go-live of a whole batch): every river's live and record figures.
create or replace function refresh_national_rollup() returns void
language plpgsql security definer set search_path to 'public' set statement_timeout to '600s' as $$
begin
  perform refresh_national_live();
  perform refresh_national_record(100000);
end $$;

revoke execute on function refresh_national_live() from public, anon, authenticated;
revoke execute on function refresh_national_record(integer, uuid) from public, anon, authenticated;
revoke execute on function refresh_national_rollup() from public, anon, authenticated;
grant execute on function refresh_national_live() to service_role;
grant execute on function refresh_national_record(integer, uuid) to service_role;
grant execute on function refresh_national_rollup() to service_role;
