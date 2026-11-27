import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { hasAnyTask, type Task } from "@/lib/tasks";

/**
 * Returns the signed-in user's profile (org + role), or redirects to /login.
 * Deactivated accounts are treated as signed-out.
 * Use at the top of authenticated Server Components / Actions.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Signed in but no profile yet: a new account that hasn't accepted its invitation (migration 0129).
  if (!profile) redirect("/auth/accept");
  const p = profile as Profile;
  if (!p.active) redirect("/login?deactivated=1");

  // A member can belong to several rivers (migration 0088). Everything downstream works on the river
  // they're currently on, with the role they hold there (migration 0109's my_role(), the same rule
  // RLS uses): organisation_id becomes that river and role that role. The home river stays available
  // as home_organisation_id.
  //
  // Groups (migration 0126): the member works as one group (active_group_id) on one river. my_role()
  // maps their base role there to the old admin/volunteer/viewer, and my_tasks() lists their tasks
  // (a lead has them all). No group on this river means viewer with no tasks.
  const current = p.active_organisation_id ?? p.organisation_id;
  const [{ data: myRole }, { data: myTasks }] = await Promise.all([
    supabase.rpc("my_role" as never),
    supabase.rpc("my_tasks" as never),
  ]);
  const role = (myRole as unknown as Profile["role"] | null) ?? "viewer";
  const tasks = ((myTasks as unknown as Task[] | null) ?? []) as Task[];
  return { ...p, home_organisation_id: p.organisation_id, organisation_id: current, role, tasks };
}

/** Holds at least one of the tasks in the current group, else back to the dashboard. */
export async function requireTask(...tasks: Task[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasAnyTask(profile.tasks, ...tasks)) redirect("/dashboard");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/** Admin or volunteer — i.e. may create/edit data. Viewers are read-only. */
export async function requireEditor(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "volunteer") redirect("/dashboard");
  return profile;
}

export function canEdit(role: AppRoleLike): boolean {
  return role === "admin" || role === "volunteer";
}
type AppRoleLike = "admin" | "volunteer" | "viewer";

/** River Hub moderator (migration 0107): reviews adoption requests across every river. Moderator is a
 *  flag on the account, independent of the member's role in their own river. */
export async function isModerator(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_moderator" as never);
  return (data as unknown) === true;
}

export async function requireModerator(): Promise<Profile> {
  const profile = await requireProfile();
  if (!(await isModerator())) redirect("/dashboard");
  return profile;
}

/** The River Hub site owner (migration 0126 site_roles): onboards rivers and groups. */
export async function isSiteOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_site_owner" as never);
  return (data as unknown) === true;
}

export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile();
  if (!(await isSiteOwner())) redirect("/dashboard");
  return profile;
}
