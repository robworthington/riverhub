import { InviteForm } from "@/components/InviteForm";
import { UserRow, type UserRowData } from "@/components/UserRow";
import { OpenInvites, JoinRequests, type OpenInvite, type JoinRequest } from "@/components/GroupInbox";
import { requireTask } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email";
import { BASE_ROLE_LABELS, TASK_LABELS, TASKS, type BaseRole, type Task } from "@/lib/tasks";
import type { Profile } from "@/lib/types";

// The Members page (migration 0126): everyone in the group the signed-in member is working as, with
// their base role and tasks. Needs the membership task.
export default async function MembersPage() {
  const me = await requireTask("membership");
  const supabase = await createClient();
  const groupId = me.active_group_id;

  const [{ data: group }, { data: members }, { data: invites }, { data: requests }] = await Promise.all([
    supabase.from("groups" as never).select("name, slug").eq("id" as never, groupId as never).maybeSingle(),
    supabase
      .from("group_members" as never)
      .select("profile_id, base_role, tasks, status")
      .eq("group_id" as never, groupId as never)
      .eq("status" as never, "active" as never),
    // open invitations and join requests (migration 0129)
    supabase
      .from("invitations" as never)
      .select("id, email, full_name, base_role, sent_at, expires_at")
      .eq("group_id" as never, groupId as never)
      .is("accepted_at" as never, null)
      .is("cancelled_at" as never, null)
      .order("sent_at" as never, { ascending: false }),
    supabase
      .from("join_requests" as never)
      .select("id, name, email, message, created_at")
      .eq("group_id" as never, groupId as never)
      .eq("status" as never, "pending" as never)
      .order("created_at" as never),
  ]);
  const memberRows = (members as unknown as { profile_id: string; base_role: BaseRole; tasks: Task[] }[]) ?? [];
  const ids = memberRows.map((m) => m.profile_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("*").in("id", ids).order("created_at")
    : { data: [] };
  const byId = new Map(memberRows.map((m) => [m.profile_id, m]));

  // login details (email, last sign-in) need the service role
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map<string, { email?: string; last_sign_in_at?: string | null }>();
  for (const u of authData?.users ?? []) authById.set(u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at });

  const meLead = byId.get(me.id)?.base_role === "lead";
  const rows: UserRowData[] = ((profiles as Profile[]) ?? []).map((p) => {
    const a = authById.get(p.id);
    const m = byId.get(p.id)!;
    return {
      id: p.id,
      name: p.full_name,
      email: a?.email ?? null,
      baseRole: m.base_role,
      tasks: m.base_role === "lead" ? [...TASKS] : m.tasks,
      active: p.active,
      status: !p.active ? "deactivated" : a?.last_sign_in_at ? "active" : "invited",
      lastSignIn: a?.last_sign_in_at ?? null,
      isSelf: p.id === me.id,
    };
  });
  const g = group as unknown as { name: string; slug: string } | null;
  const groupName = g?.name ?? "this group";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Members</h1>
        <p className="text-sm text-gray-600">
          People in {groupName}. Their roles apply to every river the group works on.
          {g?.slug && <> People can also ask to join from <a className="text-river-700 hover:underline" href={`/g/${g.slug}`}>the group&rsquo;s public page</a>.</>}
        </p>
      </div>

      <JoinRequests requests={(requests as unknown as JoinRequest[]) ?? []} canMakeLead={meLead} />

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Invite someone</h2>
        <InviteForm canMakeLead={meLead} />
        {!emailConfigured() && (
          <p className="mt-2 text-xs text-amber-700">
            Custom email isn&rsquo;t configured: new people get Supabase&rsquo;s default invite, and for people who
            already have an account you&rsquo;ll be given a link to send them yourself.
          </p>
        )}
      </div>

      <OpenInvites invites={(invites as unknown as OpenInvite[]) ?? []} />

      <details className="card text-xs text-gray-600">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">How roles and tasks work</summary>
        <p className="mt-2">
          Everyone has one role. A <strong>{BASE_ROLE_LABELS.lead}</strong> can do everything; a group always keeps at
          least one. <strong>{BASE_ROLE_LABELS.coordinator}s</strong> and <strong>{BASE_ROLE_LABELS.volunteer}s</strong> start
          with the tasks below and you can add or take away tasks for each person. A{" "}
          <strong>{BASE_ROLE_LABELS.viewer}</strong> can read the members&rsquo; pages but change nothing.
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {TASKS.map((t) => (
            <li key={t}><span className="font-medium text-gray-800">{TASK_LABELS[t].label}</span>: {TASK_LABELS[t].hint}</li>
          ))}
        </ul>
      </details>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Person</th>
              <th className="px-4 py-2">Role and tasks</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => <UserRow key={u.id} u={u} canMakeLead={meLead} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
