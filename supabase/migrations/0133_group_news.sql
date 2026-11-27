-- 0133: a group's news line on its rivers' public pages (spills page redesign, 27 Nov 2026).
--
-- * groups.news (up to 200 characters) and news_updated_at, set from Group settings (comms task).
-- * update_group gains p_news ('' clears it).
-- * public_river_groups also returns donate_url, news and news_updated_at, for the group strip at the
--   top of a river's spills page.

alter table public.groups
  add column news text check (news is null or length(news) <= 200),
  add column news_updated_at timestamptz;

drop function if exists public.update_group(text, text, text, text, boolean, boolean);
create function public.update_group(p_name text, p_logo_url text, p_website_url text, p_donate_url text,
                                    p_results_need_approval boolean, p_publish_results boolean default null,
                                    p_news text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid := current_group(); v_approval boolean; v_publish boolean;
begin
  if g is null then raise exception 'not_allowed'; end if;
  if (p_name is not null or p_logo_url is not null or p_website_url is not null or p_donate_url is not null
      or p_news is not null) and not has_task('comms') then
    raise exception 'needs_comms';
  end if;
  if (p_results_need_approval is not null or p_publish_results is not null) and not has_task('settings') then
    raise exception 'needs_settings';
  end if;
  if p_name is not null and length(trim(p_name)) = 0 then raise exception 'name_required'; end if;
  if p_news is not null and length(trim(p_news)) > 200 then raise exception 'news_too_long'; end if;
  select coalesce(p_results_need_approval, results_need_approval), coalesce(p_publish_results, publish_results)
    into v_approval, v_publish from groups where id = g;
  if v_publish and not v_approval then
    if p_publish_results then raise exception 'publish_needs_approval'; end if;
    v_publish := false;
  end if;
  update groups set
    name = coalesce(nullif(trim(p_name), ''), name),
    logo_url = case when p_logo_url is null then logo_url else nullif(trim(p_logo_url), '') end,
    website_url = case when p_website_url is null then website_url else nullif(trim(p_website_url), '') end,
    donate_url = case when p_donate_url is null then donate_url else nullif(trim(p_donate_url), '') end,
    news = case when p_news is null then news else nullif(trim(p_news), '') end,
    news_updated_at = case when p_news is null or nullif(trim(p_news), '') is not distinct from news
                           then news_updated_at else now() end,
    results_need_approval = v_approval,
    publish_results = v_publish
  where id = g;
end $$;
revoke execute on function public.update_group(text, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.update_group(text, text, text, text, boolean, boolean, text) to authenticated;

drop function if exists public.public_river_groups(uuid);
create function public.public_river_groups(p_org uuid)
returns table (name text, slug text, website_url text, logo_url text, donate_url text, news text,
               news_updated_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select g.name, g.slug, g.website_url, g.logo_url, g.donate_url, g.news, g.news_updated_at
  from group_rivers gr join groups g on g.id = gr.group_id and g.status = 'active'
  where gr.organisation_id = p_org
  order by gr.since, g.created_at, g.name
$$;
grant execute on function public.public_river_groups(uuid) to anon, authenticated;
