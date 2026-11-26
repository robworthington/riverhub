-- 0122: Counts for the members' dashboard ("jobs waiting"), for the river the member is on.
--
-- Security invoker: every table here is read through row-level security, which limits it to
-- current_org() (the member's switched-to river), so a member only ever counts their own river.
-- measures_awaiting_linking() is security definer but also uses current_org() (0121).
-- Request deadlines follow src/lib/requests.ts: open = sent/acknowledged/extended/internal_review,
-- due = extended_to, else due_on.

create or replace function public.member_dashboard()
returns jsonb language sql stable as $$
  with open_req as (
    select coalesce(extended_to, due_on) as due
    from info_requests
    where status in ('sent', 'acknowledged', 'extended', 'internal_review')
  ),
  last_result as (
    select s.id, max(r.date_collected) as last_on
    from test_sites s left join test_results r on r.site_id = s.id
    group by s.id
  )
  select jsonb_build_object(
    'requests_overdue',  (select count(*) from open_req where due < current_date),
    'requests_due_soon', (select count(*) from open_req where due >= current_date and due <= current_date + 7),
    'requests_open',     (select count(*) from open_req),
    'requests_drafts',   (select count(*) from info_requests where status = 'draft'),
    -- a reply has come back but its figures aren't in River Hub yet
    'requests_unloaded', (select count(*) from info_requests where status in ('answered', 'partial') and not data_loaded),
    'photos_pending',    (select count(*) from river_photos where status = 'pending'),
    'winep_to_link',     (select count(*) from measures_awaiting_linking()),
    'assets_no_system',  (select count(*) from sewage_assets where sewage_system_id is null),
    'sites_total',       (select count(*) from test_sites),
    -- sampled before, but not in the last 8 weeks
    'sites_stale',       (select count(*) from last_result where last_on is not null and last_on < current_date - 56),
    'results_month',     (select count(*) from test_results where date_collected >= date_trunc('month', current_date))
  )
$$;

revoke all on function public.member_dashboard() from public, anon;
grant execute on function public.member_dashboard() to authenticated;
