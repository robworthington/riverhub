-- 0116: River health outline tolerance + empty-state data.
--
-- Catchment outlines are built from WFD water-body polygons, whose edges run down the middle of
-- some rivers: a sampling point on the main river can sit a few metres outside (RIVER DART AT
-- TOTNES WEIR is 8 m out). Points within ~300 m of the outline now count as inside (0.003 degrees:
-- about 210 m east-west and 330 m north-south at 50°N), and the test runs once per sampling point
-- rather than once per sample row.
-- public_river_health also reports how many points inside the outline had any test in the period,
-- so a river with too few samples can say so instead of "not loaded yet".
create or replace function public.public_river_health(p_org uuid, p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
  -- sampling points inside (or within ~300 m of) the outline, tested once per point, not per row
  inpts as (
    select p.notation from (select distinct on (notation) notation, location from ea_wq_samples where organisation_id = p_org) p
    where not exists (select 1 from b) or exists (select 1 from b where ST_DWithin(b.geom, p.location::geometry, 0.003))
  ),
  yr as (
    select coalesce(p_year, (
      select max(extract(year from sampled_at))::int from ea_wq_samples
      where organisation_id = p_org and sampled_at < date_trunc('year', now())
        and determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation'))) as y
  ),
  s as (
    select x.notation, max(x.site_label) as site_label, x.determinand, max(x.unit) as unit,
           avg(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mean, count(*) as n, max(x.sampled_at)::date as latest
    from ea_wq_samples x, yr
    where x.organisation_id = p_org
      and x.determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation')
      and x.sample_material ilike 'RIVER%'
      and ea_wq_value(x.determinand, x.result, x.result_qualifier) is not null
      and x.site_label !~* '^MISC'
      and x.sampled_at >= make_date(yr.y - 2, 1, 1) and x.sampled_at < make_date(yr.y + 1, 1, 1)
      and x.notation in (select notation from inpts)
    group by x.notation, x.determinand
    having count(*) >= 6
  ),
  banded as (select s.*, ea_wq_band(s.determinand, s.mean) as band from s),
  per as (
    select determinand, ea_wq_test_key(determinand) as test, max(unit) as unit, count(*) as sites,
      count(*) filter (where band = 'high') as high, count(*) filter (where band = 'good') as good,
      count(*) filter (where band = 'moderate') as moderate, count(*) filter (where band = 'poor') as poor,
      count(*) filter (where band = 'bad') as bad,
      (select jsonb_agg(jsonb_build_object('notation', w.notation, 'site_label', w.site_label,
                'mean', round(w.mean, 3), 'n', w.n, 'band', w.band, 'latest', w.latest) order by w.badness desc)
         from (select b2.*, case when b2.determinand = 'Oxygen, Dissolved, % Saturation' then -b2.mean else b2.mean end as badness
               from banded b2 where b2.determinand = banded.determinand
               and b2.band in ('moderate', 'poor', 'bad') order by badness desc limit 5) w) as worst
    from banded group by determinand
  )
  select jsonb_build_object(
    'year', (select y from yr), 'from_year', (select y - 2 from yr),
    'clipped', exists (select 1 from b),
    'sites', (select count(distinct notation) from s),
    'points_tested', (select count(distinct x.notation) from ea_wq_samples x, yr
      where x.organisation_id = p_org and x.sample_material ilike 'RIVER%' and x.site_label !~* '^MISC'
        and x.determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P', 'Oxygen, Dissolved, % Saturation')
        and x.sampled_at >= make_date(yr.y - 2, 1, 1) and x.sampled_at < make_date(yr.y + 1, 1, 1)
        and x.notation in (select notation from inpts)),
    'determinands', coalesce((select jsonb_agg(to_jsonb(per) order by array_position(array['phosphate','ammonia','oxygen'], per.test)) from per), '[]'::jsonb)
  )
$$;

create or replace function public.public_works_wq_pairs(p_org uuid, p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
  -- sampling points inside (or within ~300 m of) the outline, tested once per point, not per row
  inpts as (
    select p.notation from (select distinct on (notation) notation, location from ea_wq_samples where organisation_id = p_org) p
    where not exists (select 1 from b) or exists (select 1 from b where ST_DWithin(b.geom, p.location::geometry, 0.003))
  ),
  yr as (
    select coalesce(p_year, (
      select max(extract(year from sampled_at))::int from ea_wq_samples
      where organisation_id = p_org and sampled_at < date_trunc('year', now())
        and determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P'))) as y
  ),
  pts as (
    select x.notation, max(x.site_label) as site_label, x.determinand,
           avg(ea_wq_value(x.determinand, x.result, x.result_qualifier)) as mean, count(*) as n,
           bool_or(x.sample_material ilike 'FINAL SEWAGE EFFLUENT%') as effluent,
           bool_or(x.notation in (select notation from inpts)) as inside,
           ea_wq_works_key(max(x.site_label)) as wkey,
           case when max(x.site_label) ~* '(^|\s)(U/S|ABOVE|UPSTREAM)\s' then 'us'
                when max(x.site_label) ~* '(^|\s)(D/S|BELOW|DOWNSTREAM)\s' then 'ds' end as side
    from ea_wq_samples x, yr
    where x.organisation_id = p_org
      and x.determinand in ('Ammoniacal Nitrogen as N', 'Orthophosphate, reactive as P')
      and ea_wq_value(x.determinand, x.result, x.result_qualifier) is not null
      and x.site_label !~* '^MISC'
      and x.sampled_at >= make_date(yr.y - 2, 1, 1) and x.sampled_at < make_date(yr.y + 1, 1, 1)
    group by x.notation, x.determinand
    having count(*) >= 4
  ),
  us as (select distinct on (wkey, determinand) * from pts where side = 'us' and not effluent and wkey is not null order by wkey, determinand, n desc),
  ds as (select distinct on (wkey, determinand) * from pts where side = 'ds' and not effluent and wkey is not null
           and inside order by wkey, determinand, n desc),
  fe as (select distinct on (wkey, determinand) * from pts where effluent and side is null and wkey is not null order by wkey, determinand, n desc),
  pairs as (
    select ds.wkey, ds.determinand,
      us.notation as us_notation, us.site_label as us_label, round(us.mean, 3) as us_mean, us.n as us_n,
      ds.notation as ds_notation, ds.site_label as ds_label, round(ds.mean, 3) as ds_mean, ds.n as ds_n,
      fe.site_label as fe_label, round(fe.mean, 3) as fe_mean, fe.n as fe_n
    from ds join us on us.wkey = ds.wkey and us.determinand = ds.determinand
    left join fe on fe.wkey = ds.wkey and fe.determinand = ds.determinand
  )
  select jsonb_build_object(
    'year', (select y from yr), 'from_year', (select y - 2 from yr),
    'works', coalesce((
      select jsonb_agg(w order by (w->>'ratio')::numeric desc nulls last) from (
        select jsonb_build_object(
          'key', wkey,
          'name', initcap(regexp_replace(coalesce(
            (regexp_match(max(ds_label), '(?:U/S|D/S|BELOW|DOWNSTREAM)\s+(?:OF\s+)?(.+?)\s(?:STW|WWTW|WRC|SEWAGE TREATMENT WORKS)', 'i'))[1],
            wkey), '\s*\(?(NEW|OLD)\)?\s*$', '', 'i')),
          'ratio', max(case when determinand = 'Orthophosphate, reactive as P' and us_mean > 0 then round(ds_mean / us_mean, 1) end),
          'tests', jsonb_agg(jsonb_build_object(
            'test', ea_wq_test_key(determinand), 'determinand', determinand, 'us_label', us_label, 'us_mean', us_mean, 'us_n', us_n,
            'ds_label', ds_label, 'ds_mean', ds_mean, 'ds_n', ds_n,
            'us_band', ea_wq_band(determinand, us_mean), 'ds_band', ea_wq_band(determinand, ds_mean),
            'fe_label', fe_label, 'fe_mean', fe_mean, 'fe_n', fe_n) order by ea_wq_test_key(determinand) desc)
        ) as w
        from pairs group by wkey
      ) t), '[]'::jsonb)
  )
$$;

revoke all on function public.public_river_health(uuid, int) from public;
revoke all on function public.public_works_wq_pairs(uuid, int) from public;
grant execute on function public.public_river_health(uuid, int) to anon, authenticated;
grant execute on function public.public_works_wq_pairs(uuid, int) to anon, authenticated;
