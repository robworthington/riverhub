# Roles and groups

Status: agreed in principle 27 Nov 2026, not built. Replaces the one-river-one-organisation membership
model before any group is invited.

## What was decided

1. **A river can have more than one group, and a group can cover more than one river.** Groups become
   their own records. A Rivers Trust covering twelve catchments is one group attached to twelve rivers,
   so no separate "partner admin" role is needed.
2. **Only the site owner onboards rivers.** Imports need the database password and stay outside the app.
   Groups ask for a river (adopt-a-river) and take it on once it is live.
3. **Volunteers' results can need approval before they are published.** It is a setting per group, on by
   default for new groups.
4. **River roles are a base role plus tasks** (option B): everyone in a group has one base role, and the
   group's lead can switch on individual tasks for each person.

## How it works today

- `organisations` is one row per river (89 rows). Membership is `profile_orgs (profile, organisation,
  role)` with `app_role` = admin, volunteer or viewer. `profiles.active_organisation_id` is the river a
  member is working on, read by `current_org()`.
- `is_admin()` and `can_edit()` (admin or volunteer) check the role on the active river. About 30 RLS
  policies use `is_admin() and organisation_id = current_org()`.
- `profiles.moderator` is one site-wide flag (`is_moderator()`) covering adoption requests and photo
  reports for every river.
- Rivers are created by `scripts/setup_catchment.py` and taken live by a reviewed SQL update. Giving a
  group's lead admin rights is a hand-written insert.
- One account exists (Rob: admin on the Dart, moderator).

### Faults to fix whatever else changes

| Table | Fault |
|---|---|
| `test_results`, `test_sites`, `sewage_assets`, `sewage_systems`, `asset_permits` | The `ALL` policy checks `can_edit()` only in `with check`, so its `using` clause (`organisation_id = current_org()`) lets a **viewer delete** rows. |
| `winep_asset_links` | Read and write check `profiles.organisation_id` (the home river), not `current_org()`, and any member, viewers included, can write. |
| `info_requests` | `UPDATE` `using` has no role check, so the row filter is river-only (the `with check` stops viewers, but the pattern should match the rest). |

These fixes go in the first migration below.

## The model

### Site level

| Role | Can do |
|---|---|
| **Owner** | Everything: create rivers, run imports, take rivers live, create groups, attach groups to rivers, appoint leads, assign site roles. |
| **Moderator** | Adoption requests, photo reports and flagged content on any river. No data, settings or members. |

Later, if needed: **onboarding operator** (prepare and verify rivers, invite the first lead) once imports
can run from the app, and **read-only partner** (member pages on every river, for funders or researchers).

### Group level

A **group** is a volunteer organisation: Friends of the Dart, a Rivers Trust, a swimming club. It has a
name, slug, logo, website, donate link and settings. It is attached to one or more rivers.

Each member of a group has one **base role**:

| Base role | Default tasks | Notes |
|---|---|---|
| **Lead** | all of them, always | A group must keep at least one lead. |
| **Coordinator** | data entry, sampling, photos, requests | |
| **Volunteer** | data entry | Results go to pending if the group requires approval. |
| **Viewer** | none | Reads member pages for the group's rivers. |

The defaults are a starting point. A lead (or anyone with the membership task) can add or remove tasks
for each person, so a volunteer can be given "requests" alone, or a coordinator can lose "sampling".

### Tasks

| Key | Lets the person | Today this is |
|---|---|---|
| `data_entry` | Enter results and run spreadsheet imports. Their results are pending if the group requires approval. | `can_edit()` on results and imports |
| `sampling` | Manage the group's sampling sites and test types; approve, reject or correct results (their own go straight to approved). | admin on test types; `can_edit()` on sites |
| `photos` | Approve river photos, and photo reports from the public, for the group's rivers. | admin, or the site moderator |
| `requests` | Publish and manage FOI/EIR requests, link WhatDoTheyKnow, upload responses, delete requests. Anyone who isn't a viewer can draft. | `can_edit()` to create, admin to delete |
| `regulatory` | Link WINEP measures to overflows; edit overflow details, systems and permits; write overflow notes. | `can_edit()` on assets/permits; WINEP linking (editorOnly) |
| `comms` | Edit the group's public profile and donate link, make share cards. | admin (branding is on the river today) |
| `membership` | Invite people, approve join requests, change base roles and tasks, remove people (not the last lead). | admin on users |
| `settings` | Group settings (approval on or off), API keys, the "Sync now" buttons. | admin |

### Who owns which data

| Kind | Tables | Belongs to | Read | Write |
|---|---|---|---|---|
| River data from imports | `spill_events`, `edm_*`, `rainfall_*`, `flow_readings`, `river_gauges`, `ea_wq_*`, `winep_actions`, `protected_areas`, `water_bodies`, `wastewater_catchments`, `system_assumptions`, `emergency_overflows`, `eo_annual_spills` | river | any member of a group on the river | owner and import scripts only |
| River records groups edit | `sewage_assets`, `sewage_systems`, `asset_permits`, `asset_photos`, `winep_asset_links` | river (with `edited_by_group` for credit) | any member on the river | `regulatory` task in any group on the river |
| Public submissions | `photo_reports` | river | `photos` task on the river, site moderator | same |
| Group work | `test_sites`, `test_results`, `test_types`, `imports`, `import_profiles`, `site_photos`, `info_requests` (+ documents, events, assets), `river_photos`, `api_keys` | group, on a river | any member on the river (other groups' results are public once approved anyway) | the owning group, by task |
| Site queues | `adoption_requests` | site | owner, moderator | owner, moderator |

Imported river data stops being writable by a river "admin". Today the Dart admin can edit spill events;
under this model only imports and the owner can, so one group can't change what every other group on the
river sees.

Two groups sampling the same spot keep separate sites. A later check can flag sites within ~50 m of
another group's site.

## Schema

```sql
create type base_role as enum ('lead', 'coordinator', 'volunteer', 'viewer');
create type site_role as enum ('owner', 'moderator');

create table site_roles (
  profile_id uuid references profiles(id) on delete cascade,
  role site_role not null,
  primary key (profile_id, role)
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null,
  logo_url text, website_url text, donate_url text,
  results_need_approval boolean not null default true,
  status text not null default 'active',          -- active | paused | closed
  created_at timestamptz default now()
);

create table group_rivers (
  group_id uuid references groups(id) on delete cascade,
  organisation_id uuid references organisations(id) on delete cascade,   -- the river
  since date default current_date,
  primary key (group_id, organisation_id)
);

create table group_members (
  group_id uuid references groups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  base_role base_role not null default 'volunteer',
  tasks text[] not null default '{}',              -- the person's full task list
  status text not null default 'active',           -- invited | requested | active | removed
  invited_by uuid references profiles(id),
  created_at timestamptz default now(),
  primary key (group_id, profile_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  email text not null, base_role base_role not null, tasks text[] not null default '{}',
  token_hash text not null, expires_at timestamptz not null,
  invited_by uuid references profiles(id), accepted_at timestamptz
);
```

`tasks` stores the person's task list in full (seeded from the base role's defaults when they join), so
reading it needs no lookup; a lead always has every task whatever is stored.

Group-owned tables gain `group_id uuid references groups(id)`. `test_results` also gains `status`
(`pending | approved | rejected`, default `approved` for existing rows), `reviewed_by` and `reviewed_at`.

`profiles` gains `active_group_id`. `active_organisation_id` stays as the active river, so `current_org()`
and every public RPC are unchanged.

### Helpers

| Function | Returns |
|---|---|
| `is_site_owner()`, `is_site_moderator()` | from `site_roles` (moderator is true for owners too) |
| `current_group()` | `profiles.active_group_id`, if the member is active in it |
| `my_base_role()` | base role in the current group |
| `has_task(task text)` | true if the member's current group is attached to `current_org()` and they are its lead or have `task` |
| `has_task_on_river(task text, river uuid)` | true if any group the member is active in, attached to that river, gives them the task (for river records and photo reports) |
| `is_on_river(river uuid)` | member of any active group attached to the river (read access) |

All are `stable security definer` with `search_path = public, extensions` (see 0124).

### Policy pattern

```sql
-- group work: read across the river, write within your own group by task
create policy result_read  on test_results for select using (is_on_river(organisation_id));
create policy result_write on test_results for all
  using      (group_id = current_group() and organisation_id = current_org() and has_task('data_entry'))
  with check (group_id = current_group() and organisation_id = current_org() and has_task('data_entry')
              and (status = 'pending' or has_task('sampling') or not group_needs_approval()));

-- river records: any group on the river with the task
create policy asset_write on sewage_assets for all
  using (has_task_on_river('regulatory', organisation_id))
  with check (has_task_on_river('regulatory', organisation_id));

-- imported river data: read on the river, write by owner only (scripts use the service role)
create policy spill_read  on spill_events for select using (is_on_river(organisation_id));
create policy spill_write on spill_events for all using (is_site_owner()) with check (is_site_owner());
```

Every `using` clause carries the same role check as its `with check`, which closes the delete hole.

### Publishing results

Public RPCs and classifications (`public_*`, Analysis, bathing-water classes) read only
`status = 'approved'`. Results are credited to their group on public pages ("Sampled by Friends of the
Dart"), and each river page lists the groups working on it.

## Flows

**Invite.** Lead (or `membership`) enters an email, base role and any changed tasks. A server action
writes `invitations` and sends a Supabase invite (service role, server side only). The link opens
`/auth/accept?token=…`, which creates the profile if needed, adds the `group_members` row and sets the
active group and river. Links expire after 14 days and can be resent or cancelled.

**Join request.** A "Join this group" form on the group's public profile creates a `requested` member;
anyone with `membership` approves or declines.

**Adoption.** An adopt-a-river request, once the owner or moderator approves it, either creates a group
or attaches an existing one to the river, then invites the named contact as lead.

**Switching.** The river switcher lists the (group, river) pairs a member belongs to. Most people have
one and never see it.

**Leaving.** A group detached from a river keeps its results there, still credited and public, but its
members lose write access on that river. A removed member's results stay with the group; public pages
show the group, never the person.

## Onboarding page (owner)

`/platform/rivers`: one row per river with data loaded, verified, live, groups attached and pending
adoption requests, from `organisations`, the batch results and `group_rivers`. Actions: take live (the
same SQL as today, now behind a button for the owner), create group, attach a group to a river, invite a
lead. `/platform/groups` lists groups with their rivers, leads and member counts.

## App changes

- Menus and buttons are shown by task, not by `canEdit`/admin (`nav-config.ts` `editorOnly` becomes a
  task key).
- `/admin/users` becomes the group's **Members** page: base role, tasks as tick boxes, invite, approve
  requests, remove.
- **Group settings** page: name, logo, website, donate link, approval on or off, API keys.
- **Results to review** on the dashboard for anyone with `sampling` (the dashboard already lists jobs).
- `photo_reports` and `river_photos` queues filter to rivers where the person has `photos`; the site
  moderator still sees all.

## Migrating what exists

1. Rob becomes `owner` in `site_roles`; `profiles.moderator` moves to `site_roles` and the column is
   dropped once nothing reads it.
2. For each river with members or group-owned rows (today only the Dart), create one group from the
   river's `portal_name` and attach it. Existing results are `approved`, existing rows get that group's
   `group_id`, and Rob becomes its lead.
3. `profile_orgs` rows become `group_members` (admin → lead, volunteer → volunteer, viewer → viewer);
   `profile_orgs` stays read-only for one release, then goes.
4. `is_admin()` and `can_edit()` stay as wrappers (`has_task('settings')`, `my_base_role() <> 'viewer'`)
   until every page has moved over, then go.

## Build order

| Step | Migrations | What lands |
|---|---|---|
| 1 | 0125 | Delete-hole and WINEP-link fixes on today's model (small, ships first). |
| 2 | 0126–0127 | `site_roles`, groups, group_rivers, group_members, helpers, backfill, policies rewritten; menus by task; Members and Group settings pages. |
| 3 | 0128 | Invitations, accept page, join requests. |
| 4 | 0129 | Result approval: status column, review queue, public RPCs read approved only, group credit on public pages. |
| 5 | — | Onboarding page; adoption approval creates or attaches a group. |
| Later | | Named task bundles per group (option C), onboarding operator, read-only partner, near-duplicate site check. |

Each step is dry-run in a rolled-back transaction, impersonating a lead, a volunteer, a viewer and a
member of a second group on the same river, before it is applied.

## Still to settle

- Can a group attach itself to a river, or does the owner always approve? (Suggest: owner approves.)
- Should leads see members' email addresses? (Suggest: yes, for their own group only.)
- What a group's public profile page shows, and whether it lives at `/g/<slug>`.
- Whether `comms` on a river with several groups ever edits the river's own page text, or only the
  group's profile. (Suggest: group profile only; river text stays with the owner.)
