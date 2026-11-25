-- 0115: River health (EA water-quality verdicts) + catchment outlines.
--
-- catchment_boundaries: one outline per river (union of its WFD river water-body catchments and
-- estuary opcats), loaded by scripts/import_catchment_boundary.py. Importers pick EA sampling points
-- by bounding box, so a river's ea_wq_samples include its neighbours' points; River health clips to
-- the outline. A river with no outline yet falls back to every point it holds.
--
-- ea_wq_band(): indicative Water Framework Directive bands for an annual mean. Ammonia uses the
-- UKTAG river standards (upland/low-alkalinity column); phosphate uses generic reactive-P bands;
-- dissolved oxygen (% saturation) the UKTAG upland/lowland bands, where higher is better.
-- The EA's formal classification uses 3 years and site-specific phosphate standards, so the pages
-- call these indicative. All thresholds live here, in one place.
--
-- ea_wq_samples.result_qualifier: '<' for a below-detection reading (the EA sends "<0.03"); result then
-- holds the detection limit. import_ea_wq_samples.py stored such readings as null before this, so
-- ea_wq_value() counts a reading at half its limit (the usual convention) and, for rows loaded before
-- the fix (null result, no qualifier), at half the EA's usual limit (ammonia 0.03, phosphate 0.01).
--
-- public_river_health(p_org, p_year): band counts and the worst points per determinand, from river
-- samples (no effluent) inside the outline, over the 3 full years ending p_year (default: the latest
-- full year with data), as WFD classification does.
-- public_works_wq_pairs(p_org, p_year): river points the EA names as above (U/S) and below (D/S) a
-- sewage works, paired by works name, with the works' final-effluent sample where there is one.

-- metadata-only change, but it needs a brief exclusive lock: fail fast rather than queue behind a
-- running import (re-run the migration if it times out)
set local lock_timeout = '10s';
alter table public.ea_wq_samples add column if not exists result_qualifier text;

create or replace function public.ea_wq_value(p_determinand text, p_result numeric, p_qualifier text)
returns numeric language sql immutable as $$
  select case
    when p_qualifier = '<' then p_result / 2
    when p_result is not null then p_result
    when p_determinand = 'Ammoniacal Nitrogen as N' then 0.015
    when p_determinand = 'Orthophosphate, reactive as P' then 0.005
  end
$$;

create table if not exists public.catchment_boundaries (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  geom geometry(MultiPolygon, 4326) not null,
  source text,
  updated_at timestamptz not null default now()
);
create index if not exists catchment_boundaries_geom_idx on public.catchment_boundaries using gist (geom);
alter table public.catchment_boundaries enable row level security;
drop policy if exists catchment_boundaries_read on public.catchment_boundaries;
create policy catchment_boundaries_read on public.catchment_boundaries for select using (true);
revoke insert, update, delete, truncate on public.catchment_boundaries from anon, authenticated;

create or replace function public.ea_wq_band(p_determinand text, p_mean numeric)
returns text language sql immutable as $$
  select case
    when p_mean is null then null
    when p_determinand = 'Ammoniacal Nitrogen as N' then case
      when p_mean <= 0.2 then 'high' when p_mean <= 0.3 then 'good' when p_mean <= 0.75 then 'moderate'
      when p_mean <= 1.1 then 'poor' else 'bad' end
    when p_determinand = 'Orthophosphate, reactive as P' then case
      when p_mean <= 0.036 then 'high' when p_mean <= 0.069 then 'good' when p_mean <= 0.173 then 'moderate'
      when p_mean <= 1.003 then 'poor' else 'bad' end
    when p_determinand = 'Oxygen, Dissolved, % Saturation' then case
      when p_mean >= 80 then 'high' when p_mean >= 75 then 'good' when p_mean >= 64 then 'moderate'
      when p_mean >= 50 then 'poor' else 'bad' end
  end
$$;

-- Short key the pages use for each determinand.
create or replace function public.ea_wq_test_key(p_determinand text)
returns text language sql immutable as $$
  select case p_determinand when 'Ammoniacal Nitrogen as N' then 'ammonia' when 'Orthophosphate, reactive as P' then 'phosphate' when 'Oxygen, Dissolved, % Saturation' then 'oxygen' end
$$;

-- Normalised works key from an EA site label, e.g. "RIVER ERME AT A38 BR U/S IVYBRIDGE STW" -> IVYBRIDGE,
-- "BROADHEMPSTON (NEW) STW FE" -> BROADHEMPSTON. Null when the label names no works.
create or replace function public.ea_wq_works_key(p_label text)
returns text language sql immutable as $$
  select nullif(regexp_replace(public.works_name_key(
    coalesce((regexp_match(p_label,
      '(?:U/S|D/S|ABOVE|BELOW|UPSTREAM|DOWNSTREAM)\s+(?:OF\s+)?(.+?\s(?:\(?NEW\)?\s+|\(?OLD\)?\s+)?(?:STW|WWTW|WRC|SEWAGE TREATMENT WORKS))', 'i'))[1],
      case when p_label ~* '\s(STW|WWTW|WRC|SEWAGE TREATMENT WORKS)' then p_label end)
  ), '(NEW|OLD)$', ''), '')
$$;

create or replace function public.public_river_health(p_org uuid, p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
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
      and (not exists (select 1 from b) or exists (select 1 from b where ST_Intersects(b.geom, x.location::geometry)))
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
    'determinands', coalesce((select jsonb_agg(to_jsonb(per) order by array_position(array['phosphate','ammonia','oxygen'], per.test)) from per), '[]'::jsonb)
  )
$$;

create or replace function public.public_works_wq_pairs(p_org uuid, p_year int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select geom from catchment_boundaries where organisation_id = p_org),
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
           bool_or(exists (select 1 from b where ST_Intersects(b.geom, x.location::geometry))) as inside,
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
           and (inside or not exists (select 1 from b)) order by wkey, determinand, n desc),
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
