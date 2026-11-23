-- River Hub — "What we know about this river" (design canvas, null states).
--
-- 1. organisations.steward: who looks after a river on River Hub. 'group' = a local group has claimed
--    it; 'river_hub' = River Hub publishes the national open data and invites a group to adopt it.
--    Replaces guessing from whether the organisation's name starts with "River".
-- 2. public_river_evidence(org): one row saying how complete each layer of evidence is for a river,
--    so its pages can show a gap as a gap (and the step it's at), never as a clean bill.

alter table organisations add column if not exists steward text not null default 'river_hub';
do $$ begin
  alter table organisations add constraint organisations_steward_check check (steward in ('group', 'river_hub'));
exception when duplicate_object then null; end $$;

-- The rivers with a local group today (23 Nov 2026).
update organisations set steward = 'group' where river_slug in ('dart', 'teign', 'yealm') and steward <> 'group';

create or replace function public_river_evidence(p_org uuid)
returns table (
  steward            text,
  group_name         text,
  group_url          text,
  overflows          integer,
  monitors           integer,
  reporting          integer,
  live_as_of         timestamptz,
  record_from        integer,
  record_to          integer,
  winep_actions      integer,
  works              integer,
  works_assessed     integer,
  capacity_response  boolean,
  eo_count           integer,
  incidents_loaded   boolean,
  incidents          integer,
  requests           jsonb    -- latest published request per layer: [{layer, status, sent_on, due_on, extended_to, answered_on, wdtk_url}]
)
language sql stable security definer set search_path = public as $$
  with o as (
    select * from organisations where id = p_org and live
  ),
  w as (
    select count(*)::integer as works, count(*) filter (where verdict <> 'not_assessed')::integer as assessed
    from public_spills_works(p_org)
  ),
  yr as (select min_year, max_year from public_spill_year_range(p_org)),
  r as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'layer', x.layer, 'status', x.status, 'sent_on', x.sent_on, 'due_on', x.due_on,
             'extended_to', x.extended_to, 'answered_on', x.answered_on, 'wdtk_url', x.wdtk_url)), '[]'::jsonb) as reqs
    from (
      select distinct on (ir.layer) ir.layer, ir.status, ir.sent_on, ir.due_on, ir.extended_to, ir.answered_on, ir.wdtk_url
      from info_requests ir
      where ir.organisation_id = p_org and ir.is_public and ir.status <> 'draft'
      order by ir.layer, coalesce(ir.sent_on, ir.created_at::date) desc
    ) x
  )
  select
    o.steward,
    case when o.steward = 'group' then o.name end,
    case when o.steward = 'group' then o.marketing_url end,
    (select count(*)::integer from sewage_assets a where a.organisation_id = p_org),
    nr.monitors, nr.reporting, nr.live_as_of,
    (select min_year from yr), (select max_year from yr),
    nr.winep_actions,
    (select works from w), (select assessed from w),
    o.capacity_response,
    (select count(*)::integer from emergency_overflows e where e.organisation_id = p_org),
    exists (select 1 from pollution_incidents),
    (select count(*)::integer from pollution_incidents pi
       where pi.organisation_id = p_org and pi.is_sewage and pi.eil_water in (1, 2)),
    (select reqs from r)
  from o
  left join national_river_rollup nr on nr.org_id = o.id
$$;

grant execute on function public_river_evidence(uuid) to anon, authenticated;
