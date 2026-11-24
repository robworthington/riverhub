-- 0111 — Hourly sync and storage ready for all of England (ENGLAND-ROLLOUT-PLAN.md, Phase 0.1–0.2).
--
-- * prune_edm_snapshots(): the hourly sync writes one snapshot per overflow per hour (28k rows a day at
--   30 rivers, ~350k at England scale, ~50 GB a year if never pruned). Nothing reads raw snapshots older
--   than 48 hours (the overflow page's feed heartbeat and the live-status counts), and long-term spill
--   history comes from spill_events. Keep every row for p_keep_days; older than that keep only status
--   changes and each overflow's latest row. Run daily by /api/cron/edm-sync.
-- * organisations.ea_synced_at: when each river's EA rainfall/flow was last synced. The hourly run now
--   syncs EA for the least-recently-synced rivers within a time budget, so the whole fleet is covered
--   through the day instead of every river every hour.
-- * ea_wq_samples indexes: three are exact prefixes of the (organisation_id, notation, determinand,
--   sampled_at) unique key and are dropped; the determinand-only index becomes (organisation_id,
--   determinand, sampled_at), which is what the analysis page and the heatmap layers filter on.

create or replace function prune_edm_snapshots(p_keep_days integer default 7) returns integer
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare n integer;
begin
  with ranked as (
    select id,
           captured_at,
           status,
           lag(status) over (partition by asset_id order by captured_at) as prev_status,
           row_number() over (partition by asset_id order by captured_at desc) as rn
    from edm_snapshots
  )
  delete from edm_snapshots s
   using ranked r
   where s.id = r.id
     and r.captured_at < now() - make_interval(days => greatest(p_keep_days, 2))
     and r.rn > 1                                   -- never the overflow's latest reading
     and r.prev_status is not distinct from r.status; -- keep every change of status
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function prune_edm_snapshots(integer) from public, anon, authenticated;
grant execute on function prune_edm_snapshots(integer) to service_role;

alter table organisations add column if not exists ea_synced_at timestamptz;

drop index if exists ea_wq_samples_organisation_id_idx;
drop index if exists ea_wq_samples_organisation_id_notation_determinand_idx;
drop index if exists ea_wq_samples_notation_idx;
drop index if exists ea_wq_samples_determinand_idx;
create index if not exists ea_wq_samples_org_determinand_idx
  on ea_wq_samples (organisation_id, determinand, sampled_at);
