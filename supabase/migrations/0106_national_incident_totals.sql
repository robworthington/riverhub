-- 0106 — Pollution incidents in the national home and district totals.
--
-- One row per live river (zero where it has none) with its serious sewage pollution incidents: the
-- same set the river's own Pollution incidents page shows (0100/0105: involving sewage, category 1 or
-- 2 impact on water, within 1 km of the river's network). The home page and district pages sum these,
-- so England, each district and each river always agree. Optionally limited to one district.
-- Counts only: no locations or references, so nothing here is more identifying than 0100's lists.

create or replace function national_incident_totals(p_district text default null)
returns table (
  slug text, river_name text, district_slug text, district_name text,
  incidents integer, since_2020 integer, major integer, first_on date, latest_on date
)
language sql stable security definer set search_path = public as $$
  select o.river_slug, o.river_name, d.slug, d.name,
         count(p.not_id)::integer,
         count(p.not_id) filter (where p.occurred_at >= '2020-01-01')::integer,
         count(p.not_id) filter (where p.eil_water = 1)::integer,
         min(p.occurred_at)::date,
         max(p.occurred_at)::date
  from organisations o
  left join river_basin_districts d on d.id = o.rbd_id
  left join pollution_incidents p
    on p.organisation_id = o.id and p.is_sewage and p.eil_water in (1, 2)
  where o.live and o.river_slug is not null
    and (p_district is null or d.slug = p_district)
  group by o.id, o.river_slug, o.river_name, d.slug, d.name
  order by count(p.not_id) desc, o.river_name
$$;

revoke all on function national_incident_totals(text) from public;
grant execute on function national_incident_totals(text) to anon, authenticated;
