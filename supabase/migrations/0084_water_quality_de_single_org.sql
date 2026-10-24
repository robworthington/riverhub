-- Phase 1 workstream B — de-single-org the WATER-QUALITY (EA monitoring) section. Completes B3:
-- after this, every public-portal RPC resolves its organisation explicitly. Additive / append-only.
--
--  * public_ea_wq_sites         -> new p_org overload; the no-arg version delegates via public_org().
--  * public_ea_wq_site_samples  -> new (p_org, p_notation) overload; the (p_notation) version
--    delegates. EA notations can be shared across orgs, so the org scope is kept (sourced from p_org).
--
-- Instance mode is unchanged (legacy signatures delegate through public_org()); national /r routes
-- call the p_org overloads.

-- public_ea_wq_sites --------------------------------------------------------------------------
create or replace function public_ea_wq_sites(p_org uuid)
returns table (notation text, site_label text, latitude double precision, longitude double precision,
               wb_name text, determinands text[], n_samples bigint, latest_sample timestamptz)
language sql stable security definer set search_path = public as $$
  select notation, max(site_label), max(latitude), max(longitude), max(wb_name),
         array_agg(distinct determinand order by determinand), count(*), max(sampled_at)
  from ea_wq_samples where organisation_id = p_org
  group by notation
  order by max(site_label);
$$;
create or replace function public_ea_wq_sites()
returns table (notation text, site_label text, latitude double precision, longitude double precision,
               wb_name text, determinands text[], n_samples bigint, latest_sample timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public_ea_wq_sites((select public_org()));
$$;
grant execute on function public_ea_wq_sites(uuid) to anon, authenticated;

-- public_ea_wq_site_samples -------------------------------------------------------------------
create or replace function public_ea_wq_site_samples(p_org uuid, p_notation text)
returns table (determinand text, unit text, result numeric, sampled_at timestamptz, purpose text)
language sql stable security definer set search_path = public as $$
  select determinand, unit, result, sampled_at, purpose
  from ea_wq_samples
  where organisation_id = p_org and notation = p_notation
  order by determinand, sampled_at;
$$;
create or replace function public_ea_wq_site_samples(p_notation text)
returns table (determinand text, unit text, result numeric, sampled_at timestamptz, purpose text)
language sql stable security definer set search_path = public as $$
  select * from public_ea_wq_site_samples((select public_org()), p_notation);
$$;
grant execute on function public_ea_wq_site_samples(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
