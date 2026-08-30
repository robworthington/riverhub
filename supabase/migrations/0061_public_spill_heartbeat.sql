-- Spills framing, Phase 4 polish: the 48-hour feed heartbeat on the public asset page.
-- Returns the snapshot capture times in the last 48 hours; the page buckets them into hourly ticks
-- (our polling cadence is hourly, so 48 ticks = the last 48 hours). Anon-readable, org-scoped.

create or replace function public_spill_heartbeat(p_asset uuid)
returns table (captured_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.captured_at from edm_snapshots s
  where s.asset_id = p_asset and s.organisation_id = (select public_org())
    and s.captured_at >= now() - interval '48 hours'
  order by s.captured_at;
$$;
grant execute on function public_spill_heartbeat(uuid) to anon, authenticated;
