-- 0117: EA water quality on the map, and a page per sampling point (design options C and D).
--
-- public_wq_map_points(p_org, p_year): every river sampling point inside (or within ~300 m of) the
--   river's outline with phosphate, ammonia or dissolved-oxygen tests in the 3 full years ending p_year
--   (default: the latest full year with data), with each test's mean and, at 6+ tests, its band.
--   Same points, period and rules as public_river_health (0116), so the map and the health page agree.
-- public_wq_point(p_org, p_notation): one point's label, position, works key/side and the same 3-year
--   summary per graded test (mean, max, count, band).
-- public_wq_point_samples(p_org, p_notation): every sample at the point, with the below-detection
--   qualifier and sample material (public_ea_wq_site_samples predates both columns).
-- Read-only; no table changes.

create or replace function public.public_wq_map_points(p_org uuid, p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  -- Aggregate only the period's graded-test rows (org+determinand+date index), then test each point's
  -- position against the outline once: a distinct-on over every sample took ~14 s on the Hampshire Avon.
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
  yr as (
    select coalesce(p_year, (
      select max(extract(year from sampled_at))::int from ea_wq_samples
      where organisation_id = p_org and sampled_at < date_trunc('year', now())
        and determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation'))) as y
  ),
  s as (
    select x.notation, max(x.site_label) as site_label, x.determinand,
           avg(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mean, count(*) as n, max(x.sampled_at)::date as latest,
           max(x.latitude) as lat, max(x.longitude) as lng
    from ea_wq_samples x, yr
    where x.organisation_id = p_org
      and x.determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation')
      and x.sample_material ilike 'RIVER%'
      and ea_wq_value(x.determinand, x.result, x.result_qualifier) is not null
      and x.site_label !~* '^MISC'
      and x.sampled_at >= make_date(yr.y - 2, 1, 1) and x.sampled_at < make_date(yr.y + 1, 1, 1)
      and x.latitude is not null and x.longitude is not null
    group by x.notation, x.determinand
  ),
  pt as (   -- one row per point, kept if inside (or within ~300 m of) the outline, as in 0116
    select notation, max(lat) as lat, max(lng) as lng from s group by notation
  ),
  inpt as (
    select pt.* from pt
    where not exists (select 1 from b)
       or exists (select 1 from b where ST_DWithin(b.geom, ST_SetSRID(ST_MakePoint(pt.lng, pt.lat), 4326), 0.003))
  ),
  pp as (   -- one object per point
    select s.notation, jsonb_build_object(
        'notation', s.notation, 'site_label', max(s.site_label),
        'lat', round(max(i.lat)::numeric, 5), 'lng', round(max(i.lng)::numeric, 5),
        'latest', max(s.latest),
        'tests', jsonb_object_agg(ea_wq_test_key(s.determinand), jsonb_build_object(
          'mean', round(s.mean, 3), 'n', s.n,
          'band', case when s.n >= 6 then ea_wq_band(s.determinand, s.mean) end))) as j
    from s join inpt i on i.notation = s.notation
    group by s.notation
  )
  select jsonb_build_object(
    'year', (select y from yr), 'from_year', (select y - 2 from yr),
    'points', coalesce((select jsonb_agg(pp.j order by pp.notation) from pp), '[]'::jsonb)
  )
$$;

create or replace function public.public_wq_point(p_org uuid, p_notation text)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (
    select notation, max(site_label) as site_label, max(wb_name) as wb_name,
           max(latitude) as lat, max(longitude) as lng, count(*) as n_samples,
           min(sampled_at)::date as first_sample, max(sampled_at)::date as latest
    from ea_wq_samples where organisation_id = p_org and notation = p_notation
    group by notation
  ),
  yr as (
    select max(extract(year from sampled_at))::int as y from ea_wq_samples
    where organisation_id = p_org and notation = p_notation and sampled_at < date_trunc('year', now())
      and determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation')
  ),
  s as (
    select x.determinand, avg(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mean,
           max(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mx,
           min(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mn, count(*) as n,
           bool_and(x.sample_material ilike 'RIVER%') as river   -- river standards don't apply to effluent
    from ea_wq_samples x, yr
    where x.organisation_id = p_org and x.notation = p_notation
      and x.determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation')
      and ea_wq_value(x.determinand, x.result, x.result_qualifier) is not null
      and x.sampled_at >= make_date(yr.y - 2, 1, 1) and x.sampled_at < make_date(yr.y + 1, 1, 1)
    group by x.determinand
  )
  select case when exists (select 1 from p) then jsonb_build_object(
    'notation', p.notation, 'site_label', p.site_label, 'wb_name', p.wb_name,
    'lat', p.lat, 'lng', p.lng, 'n_samples', p.n_samples, 'first_sample', p.first_sample, 'latest', p.latest,
    'works_key', ea_wq_works_key(p.site_label),
    'side', case when p.site_label ~* '(^|\s)(U/S|ABOVE|UPSTREAM)\s' then 'us'
                 when p.site_label ~* '(^|\s)(D/S|BELOW|DOWNSTREAM)\s' then 'ds' end,
    'year', (select y from yr), 'from_year', (select y - 2 from yr),
    'tests', coalesce((select jsonb_agg(jsonb_build_object(
        'test', ea_wq_test_key(s.determinand), 'determinand', s.determinand,
        'mean', round(s.mean, 3), 'max', round(s.mx, 3), 'min', round(s.mn, 3), 'n', s.n,
        'band', case when s.n >= 6 and s.river then ea_wq_band(s.determinand, s.mean) end)
      order by array_position(array['phosphate','ammonia','oxygen'], ea_wq_test_key(s.determinand))) from s), '[]'::jsonb)
  ) end
  from p
$$;

create or replace function public.public_wq_point_samples(p_org uuid, p_notation text)
returns table (determinand text, unit text, result numeric, result_qualifier text, sampled_at timestamptz,
               purpose text, sample_material text)
language sql stable security definer set search_path = public as $$
  select determinand, unit, result, result_qualifier, sampled_at, purpose, sample_material
  from ea_wq_samples
  where organisation_id = p_org and notation = p_notation
  order by determinand, sampled_at;
$$;

revoke all on function public.public_wq_map_points(uuid, int) from public;
revoke all on function public.public_wq_point(uuid, text) from public;
revoke all on function public.public_wq_point_samples(uuid, text) from public;
grant execute on function public.public_wq_map_points(uuid, int) to anon, authenticated;
grant execute on function public.public_wq_point(uuid, text) to anon, authenticated;
grant execute on function public.public_wq_point_samples(uuid, text) to anon, authenticated;
