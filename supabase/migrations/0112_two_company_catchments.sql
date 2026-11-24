-- 0112 — Catchments served by two water companies (ENGLAND-ROLLOUT-PLAN.md Phase 0.3).
--
-- A river's live "spilling now" feed was one URL per organisation (organisations.edm_feed_url). On the
-- Welsh border and a few company edges one catchment holds overflows from two companies, each on its
-- own company's feed. Each overflow can now carry its own feed URL; null keeps the river's feed, so
-- every existing river is unchanged. The importer (import_catchment.py) sets it from the company that
-- owns the outlet, and the hourly sync groups overflows by their own feed.
--
-- public_river_companies(): the companies whose overflows a river shows, largest first, for the
-- live-data credit (each company's feed is CC BY 4.0 and must be credited by name).

alter table sewage_assets add column if not exists edm_feed_url text;

create or replace function public_river_companies(p_org uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(asset_owner order by n desc, asset_owner), '{}')
  from (
    select a.asset_owner, count(*) n
    from sewage_assets a join organisations o on o.id = a.organisation_id and o.live
    where a.organisation_id = p_org and a.edm_enabled and a.asset_owner is not null
    group by a.asset_owner
  ) x
$$;

revoke all on function public_river_companies(uuid) from public;
grant execute on function public_river_companies(uuid) to anon, authenticated;
