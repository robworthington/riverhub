-- River Hub — SODRP (Storm Overflows Discharge Reduction Plan) crosswalk.
-- There is no published mapping from the ~5,600 SODRP "high priority" overflows to EDM asset IDs, so
-- we DERIVE it spatially: an overflow is treated as high-priority if it lies within the plan's
-- proximity of a high-priority designation already loaded in protected_areas (bathing waters,
-- shellfish PAs, SAC/SPA/Ramsar/MCZ, SSSI). This is an INDICATIVE proximity proxy — the official
-- determination is hydrological (does the overflow affect the site), not straight-line distance.
-- Proximity rules (from the Expanded SODRP): bathing water 1 km coastal / 5 km inland; nature sites
-- use a 1 km proxy. Targets: near a bathing water -> 2035; near a high-priority nature site ->
-- 2035-2045 (75% by 2035, remainder by 2045). See PRIORITY-SITES-METHOD.md.

-- Per-asset detail: the high-priority designations near one asset (for the asset page badge).
create or replace function sodrp_for_asset(p_asset uuid)
returns table (designation text, name text, distance_m numeric, near boolean, target text)
language sql stable security definer set search_path = public as $$
  with a as (
    select organisation_id,
           ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography as g
    from sewage_assets where id = p_asset and latitude is not null and longitude is not null
  )
  select pa.designation, pa.name,
         round(ST_Distance(a.g, pa.geom::geography))::numeric as distance_m,
         (case when pa.designation = 'bathing_water'
               then ST_Distance(a.g, pa.geom::geography)
                    <= (case when (pa.attrs->>'water_type') = 'inland' then 5000 else 1000 end)
               else ST_Distance(a.g, pa.geom::geography) <= 1000 end) as near,
         (case when pa.designation = 'bathing_water' then '2035' else '2035–2045' end) as target
  from a
  join protected_areas pa on pa.organisation_id = a.organisation_id and pa.sodrp_high_priority
    and ST_DWithin(a.g, pa.geom::geography, 5000)
  order by near desc, distance_m;
$$;
grant execute on function sodrp_for_asset(uuid) to anon, authenticated;

-- Catchment-wide summary: one row per high-priority overflow (for lists / rankings / counts).
-- Optionally scope to a set of parishes.
create or replace function sodrp_priority_assets(p_ids uuid[] default null)
returns table (asset_id uuid, asset_name text, near_bathing boolean, near_nature boolean,
               designations text, min_distance_m numeric, target text)
language sql stable security definer set search_path = public as $$
  with a as (
    select id, asset_name, organisation_id,
           ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography as g
    from sewage_assets
    where organisation_id = public_org() and latitude is not null and longitude is not null
      and (p_ids is null or parish_id = any(p_ids))
  ),
  hits as (
    select a.id, a.asset_name, pa.designation, pa.name as pa_name,
           ST_Distance(a.g, pa.geom::geography) as dist,
           (pa.designation = 'bathing_water' and ST_Distance(a.g, pa.geom::geography)
              <= (case when (pa.attrs->>'water_type') = 'inland' then 5000 else 1000 end)) as bw_near,
           (pa.designation <> 'bathing_water' and ST_Distance(a.g, pa.geom::geography) <= 1000) as nat_near
    from a
    join protected_areas pa on pa.organisation_id = a.organisation_id and pa.sodrp_high_priority
      and ST_DWithin(a.g, pa.geom::geography, 5000)
  )
  select id, asset_name, bool_or(bw_near), bool_or(nat_near),
         string_agg(distinct pa_name || ' (' || designation || ')', '; ') filter (where bw_near or nat_near),
         round(min(dist) filter (where bw_near or nat_near))::numeric,
         case when bool_or(bw_near) then '2035' when bool_or(nat_near) then '2035–2045' end
  from hits
  group by id, asset_name
  having bool_or(bw_near) or bool_or(nat_near)
  order by min(dist) filter (where bw_near or nat_near);
$$;
grant execute on function sodrp_priority_assets(uuid[]) to anon, authenticated;
