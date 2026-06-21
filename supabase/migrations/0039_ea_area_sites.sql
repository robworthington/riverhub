-- River Hub — EA monitoring points within a set of parishes (for council/parish area pages).
-- Point-in-polygon of EA samples to the given parishes; one row per EA sampling point with sample
-- count, latest sample, and a headline orthophosphate mean. SECURITY DEFINER over public_org().
create or replace function ea_area_sites(p_ids uuid[])
returns table (notation text, site_label text, n_samples bigint, latest_sample timestamptz, phosphate_mean numeric)
language sql stable security definer set search_path = public as $$
  select e.notation, max(e.site_label), count(*), max(e.sampled_at),
         round(avg(e.result) filter (where e.determinand = 'Orthophosphate, reactive as P' and e.result is not null)::numeric, 3)
  from ea_wq_samples e
  join parishes p on p.id = any(p_ids) and p.boundary is not null
    and ST_Contains(p.boundary, e.location::geometry)
  where e.organisation_id = public_org()
  group by e.notation
  order by count(*) desc;
$$;
grant execute on function ea_area_sites(uuid[]) to anon, authenticated;
