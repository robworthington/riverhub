-- Consolidate duplicate capacity/permit fields (see the field-reconciliation review).
--   asset_permits.required_processing_volume  -> permit_dwf_m3d      (same concept: consented DWF)
--   sewage_assets.processing_capacity         -> actual_capacity_m3d (built treatment throughput)
-- Back-fill the canonical column where empty, recreate the one dependent function without the
-- retired columns, then drop them. sewage_assets.storage_capacity (installed storm storage) and
-- asset_permits.required_storage_capacity (permit storm storage) are DIFFERENT concepts and are kept.

begin;

-- 1. back-fill canonical columns from the legacy ones (only where the canonical is still empty)
update asset_permits
   set permit_dwf_m3d = required_processing_volume
 where permit_dwf_m3d is null and required_processing_volume is not null;

update sewage_assets
   set actual_capacity_m3d = processing_capacity,
       actual_capacity_source = coalesce(actual_capacity_source, 'legacy processing_capacity')
 where actual_capacity_m3d is null and processing_capacity is not null;

-- 2. recreate the only function referencing the retired columns (public_area_stw, from 0030)
--    with the coalesce/labels reduced to the canonical columns
create or replace function public_area_stw(p_ids uuid[])
returns table (id uuid, name text, system_name text, capacity numeric, capacity_basis text,
               demand_central numeric, pct_remaining int)
language sql stable security definer set search_path = public as $$
  with stw as (
    select a.id, a.asset_name, a.sewage_system_id, a.actual_capacity_m3d
    from sewage_assets a
    where a.organisation_id = (select public_org())
      and a.parish_id = any(p_ids) and a.asset_type = 'sewage_treatment_works'
  ),
  permit as (
    select distinct on (asset_id) asset_id, permit_dwf_m3d
    from asset_permits order by asset_id, created_at desc
  )
  select stw.id, stw.asset_name, sy.name,
    coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d) cap,
    case when stw.actual_capacity_m3d is not null then 'installed capacity (EIR)'
         when p.permit_dwf_m3d is not null then 'permit DWF' end,
    cv.demand_central_m3d,
    case when coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d) > 0
              and cv.demand_central_m3d is not null
         then round((1 - cv.demand_central_m3d / coalesce(stw.actual_capacity_m3d, p.permit_dwf_m3d)) * 100)::int
    end
  from stw
  left join sewage_systems sy on sy.id = stw.sewage_system_id
  left join permit p on p.asset_id = stw.id
  left join system_capacity_v cv on cv.system_id = stw.sewage_system_id
  order by stw.asset_name;
$$;

-- 3. drop the retired columns
alter table asset_permits  drop column required_processing_volume;
alter table sewage_assets  drop column processing_capacity;

commit;

-- After applying, reload the PostgREST schema cache (dashboard SQL editor, direct connection):
--   notify pgrst, 'reload schema';
