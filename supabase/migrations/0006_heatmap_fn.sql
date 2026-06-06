-- River Hub — M3b: parish heat-map aggregation function.
-- SECURITY INVOKER (default) → RLS on test_results/test_sites scopes to caller's org.

create or replace function parish_heat(p_type uuid, p_from date, p_to date)
returns table (
  parish_id   uuid,
  parish_name text,
  mean_result numeric,
  n           bigint,
  geojson     text
)
language sql
stable
as $$
  select p.id,
         p.name,
         round(avg(r.result)::numeric, 1) as mean_result,
         count(r.id) as n,
         st_asgeojson(p.boundary) as geojson
  from parishes p
  join test_sites s on s.parish_id = p.id
  join test_results r on r.site_id = s.id
  where p.boundary is not null
    and r.result is not null
    and (p_type is null or r.test_type_id = p_type)
    and (p_from is null or r.date_collected >= p_from)
    and (p_to   is null or r.date_collected <= p_to)
  group by p.id, p.name, p.boundary;
$$;

grant execute on function parish_heat(uuid, date, date) to authenticated;
