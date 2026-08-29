-- Public spill year range (PUBLIC-SITE-REDESIGN.md). The spills pages built their period bar from
-- edm_annual_stats (EA annual returns, which lag a year), so the public site capped at 2025 while the
-- per-event spill_events data runs to the current year. Derive the range from spill_events instead.

create or replace function public_spill_year_range()
returns table (min_year int, max_year int)
language sql stable security definer set search_path = public as $$
  select min(extract(year from event_start))::int, max(extract(year from event_start))::int
  from spill_events where organisation_id = (select public_org());
$$;

grant execute on function public_spill_year_range() to anon, authenticated;
