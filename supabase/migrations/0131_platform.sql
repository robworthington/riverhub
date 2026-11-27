-- 0131: the owner's onboarding pages (ROLES-AND-GROUPS-SPEC.md, build step 5).
--
-- Functions behind /platform/rivers and /platform/groups. All are for the site owner only, except
-- platform_invite, which a moderator may also use to invite the first lead of a group with no lead
-- (that is what approving an adopt-a-river request does).
--
--   platform_rivers()                 every river: live, region, overflows, monitors, data loaded,
--                                     groups attached, pending adoption requests
--   platform_groups()                 every group: rivers, leads, members, open invitations
--   platform_set_live(river, live)    take a river live or offline (was a hand-written UPDATE)
--   platform_create_group(...)        a new group, optionally attached to a river
--   platform_attach(group, river)     / platform_detach(group, river)
--   platform_invite(...)              invite someone to any group, usually its lead
--
-- Attaching the first group to a river marks the river as looked after by a group (steward), as
-- approving an adoption request does; detaching the last one hands it back to River Hub.

create function public.require_site_owner() returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_site_owner() then raise exception 'not_owner'; end if;
end $$;

create function public.platform_rivers()
returns table (org_id uuid, river_slug text, river_name text, region text, company_name text, live boolean,
               steward text, overflows integer, monitors integer, reporting integer, has_spills boolean,
               has_ea_wq boolean, record_refreshed_at timestamptz, groups jsonb, pending_adoptions integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform require_site_owner();
  return query
  select o.id, o.river_slug, coalesce(o.river_name, o.name), o.region, o.company_name, o.live, o.steward::text,
         x.overflows, x.monitors, x.reporting,
         exists (select 1 from spill_events s where s.organisation_id = o.id),
         exists (select 1 from ea_wq_stats w where w.organisation_id = o.id),
         x.record_refreshed_at,
         coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug) order by g.name)
                   from group_rivers gr join groups g on g.id = gr.group_id
                   where gr.organisation_id = o.id), '[]'::jsonb),
         (select count(*)::int from adoption_requests a where a.organisation_id = o.id and a.status = 'pending')
  from organisations o
  left join national_river_rollup x on x.org_id = o.id
  where o.river_slug is not null
  order by o.region nulls last, coalesce(o.river_name, o.name);
end $$;

create function public.platform_groups()
returns table (id uuid, name text, slug text, status text, results_need_approval boolean, rivers jsonb,
               leads text[], members integer, open_invites integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform require_site_owner();
  return query
  select g.id, g.name, g.slug, g.status, g.results_need_approval,
         coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', coalesce(o.river_name, o.name),
                                                       'slug', o.river_slug, 'live', o.live) order by o.river_name)
                   from group_rivers gr join organisations o on o.id = gr.organisation_id
                   where gr.group_id = g.id), '[]'::jsonb),
         coalesce((select array_agg(coalesce(p.full_name, 'unnamed') order by p.full_name)
                   from group_members m join profiles p on p.id = m.profile_id
                   where m.group_id = g.id and m.status = 'active' and m.base_role = 'lead'), '{}'),
         (select count(*)::int from group_members m where m.group_id = g.id and m.status = 'active'),
         (select count(*)::int from invitations i where i.group_id = g.id and i.accepted_at is null
            and i.cancelled_at is null and i.expires_at > now()),
         g.created_at
  from groups g
  order by g.name;
end $$;

create function public.platform_set_live(p_org uuid, p_live boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_site_owner();
  update organisations set live = p_live where id = p_org and river_slug is not null;
  if not found then raise exception 'river_not_found'; end if;
end $$;

-- Mark a river as looked after by a group (or not), after its groups change. The river's name (which
-- public pages show as "run by") stays with its current group while that group is still attached;
-- otherwise it moves to the longest-standing group.
create function public.sync_river_steward(p_org uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare g groups;
begin
  select gg.* into g from group_rivers gr join groups gg on gg.id = gr.group_id
   where gr.organisation_id = p_org order by gr.since, gg.created_at, gg.name limit 1;
  if found then
    update organisations o set steward = 'group', name = g.name,
           marketing_url = coalesce(g.website_url, marketing_url)
     where o.id = p_org
       and (o.steward <> 'group'
            or not exists (select 1 from group_rivers gr join groups gg on gg.id = gr.group_id
                           where gr.organisation_id = p_org and gg.name = o.name));
  else
    update organisations set steward = 'river_hub', name = coalesce(river_name, name)
     where id = p_org and steward = 'group';
  end if;
end $$;

create function public.platform_create_group(p_name text, p_slug text, p_website text, p_org uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text := lower(trim(p_slug));
begin
  perform require_site_owner();
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 60 then raise exception 'bad_slug'; end if;
  if exists (select 1 from groups where slug = v_slug) then raise exception 'slug_taken'; end if;
  insert into groups (name, slug, website_url)
  values (trim(p_name), v_slug, nullif(trim(p_website), ''))
  returning id into v_id;
  if p_org is not null then
    insert into group_rivers (group_id, organisation_id) values (v_id, p_org);
    perform sync_river_steward(p_org);
  end if;
  return v_id;
end $$;

create function public.platform_attach(p_group uuid, p_org uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_site_owner();
  insert into group_rivers (group_id, organisation_id) values (p_group, p_org) on conflict do nothing;
  perform sync_river_steward(p_org);
end $$;

-- A detached group keeps its results on the river (still credited); its members lose write access there.
create function public.platform_detach(p_group uuid, p_org uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_site_owner();
  delete from group_rivers where group_id = p_group and organisation_id = p_org;
  if not found then raise exception 'not_attached'; end if;
  perform sync_river_steward(p_org);
end $$;

-- Invite someone to a group, on one of its rivers. The owner can invite anyone to any group; a
-- moderator only the first lead of a group that has none (adoption approval). Returns the token.
create function public.platform_invite(p_group uuid, p_org uuid, p_email text, p_full_name text,
                                       p_base_role public.base_role default 'lead')
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not (is_site_owner()
          or (is_site_moderator() and p_base_role = 'lead'
              and not exists (select 1 from group_members where group_id = p_group and base_role = 'lead' and status = 'active'))) then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from group_rivers where group_id = p_group and organisation_id = p_org) then
    raise exception 'not_attached';
  end if;
  if exists (select 1 from group_members m join auth.users u on u.id = m.profile_id
             where m.group_id = p_group and m.status = 'active' and lower(u.email) = v_email) then
    raise exception 'already_member';
  end if;
  update invitations set cancelled_at = now()
   where group_id = p_group and email = v_email and accepted_at is null and cancelled_at is null;
  insert into invitations (group_id, organisation_id, email, full_name, base_role, tasks, token_hash, expires_at, invited_by)
  values (p_group, p_org, v_email, nullif(trim(p_full_name), ''), p_base_role,
          case p_base_role when 'lead' then all_tasks() else default_tasks(p_base_role) end,
          invite_token_hash(v_token), now() + interval '14 days', auth.uid());
  return v_token;
end $$;

-- The owner also reads and manages invitations to any group from the groups page.
create policy invitations_owner_read on public.invitations for select using ((select is_site_owner()));

revoke execute on function public.require_site_owner() from public, anon;
revoke execute on function public.platform_rivers() from public, anon;
revoke execute on function public.platform_groups() from public, anon;
revoke execute on function public.platform_set_live(uuid, boolean) from public, anon;
revoke execute on function public.sync_river_steward(uuid) from public, anon, authenticated;
revoke execute on function public.platform_create_group(text, text, text, uuid) from public, anon;
revoke execute on function public.platform_attach(uuid, uuid) from public, anon;
revoke execute on function public.platform_detach(uuid, uuid) from public, anon;
revoke execute on function public.platform_invite(uuid, uuid, text, text, public.base_role) from public, anon;
grant execute on function public.require_site_owner() to authenticated;
grant execute on function public.platform_rivers() to authenticated;
grant execute on function public.platform_groups() to authenticated;
grant execute on function public.platform_set_live(uuid, boolean) to authenticated;
grant execute on function public.platform_create_group(text, text, text, uuid) to authenticated;
grant execute on function public.platform_attach(uuid, uuid) to authenticated;
grant execute on function public.platform_detach(uuid, uuid) to authenticated;
grant execute on function public.platform_invite(uuid, uuid, text, text, public.base_role) to authenticated;
