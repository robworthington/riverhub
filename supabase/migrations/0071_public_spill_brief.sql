-- Brief (sub-threshold) spills — discharges shorter than 15 minutes.
--
-- Every other public spills RPC excludes spills under 15 minutes (see 0056): they are too short to
-- assess against rainfall and are usually operational blips, not real discharges. This RPC returns
-- ONLY those excluded events, for a single asset and year, so the asset page can show a "brief spills"
-- note for completeness. It never feeds counts, classification, the dry / pre-STW flags, the year
-- totals or the map — the 15-minute floor everywhere else is unchanged.
--
-- duration_minutes is a generated column (null when there is no valid end). "Brief" = a real, completed
-- event between 1 and 14 minutes; null-duration (ongoing / unknown) events are NOT brief and stay in the
-- main view.

create or replace function public_spill_brief(p_asset uuid, p_year int)
returns table (event_start timestamptz, event_end timestamptz, duration_minutes int)
language sql stable security definer set search_path = public as $$
  select event_start, event_end, duration_minutes
  from spill_events
  where asset_id = p_asset
    and organisation_id = (select public_org())
    and duration_minutes is not null
    and duration_minutes > 0
    and duration_minutes < 15
    and (p_year is null or (event_start >= make_date(p_year, 1, 1) and event_start < make_date(p_year + 1, 1, 1)))
  order by event_start desc;
$$;

grant execute on function public_spill_brief(uuid, int) to anon, authenticated;
