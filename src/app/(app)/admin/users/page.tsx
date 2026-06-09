import { InviteForm } from "@/components/InviteForm";
import { UserRow, type UserRowData } from "@/components/UserRow";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email";
import type { Profile } from "@/lib/types";

export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at");
  const profileList = (profiles as Profile[]) ?? [];

  // auth metadata (email, last sign-in) — admin-only page
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map<string, { email?: string; last_sign_in_at?: string | null }>();
  for (const u of authData?.users ?? []) authById.set(u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at });

  const rows: UserRowData[] = profileList.map((p) => {
    const a = authById.get(p.id);
    const status: UserRowData["status"] = !p.active ? "deactivated" : a?.last_sign_in_at ? "active" : "invited";
    return {
      id: p.id,
      name: p.full_name,
      email: a?.email ?? null,
      role: p.role,
      active: p.active,
      status,
      lastSignIn: a?.last_sign_in_at ?? null,
      isSelf: p.id === me.id,
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Invite a user</h2>
        <InviteForm />
        {!emailConfigured() && (
          <p className="mt-2 text-xs text-amber-700">
            Custom email isn&rsquo;t configured — invites use Supabase&rsquo;s default sender. Set
            RESEND_API_KEY + RESEND_FROM to send branded emails.
          </p>
        )}
      </div>

      <div className="card text-xs text-gray-500">
        <strong className="text-gray-700">Roles:</strong>{" "}
        <span className="text-gray-700">Admin</span> manages users &amp; reference data ·{" "}
        <span className="text-gray-700">Volunteer</span> can record samples and edit data ·{" "}
        <span className="text-gray-700">Viewer</span> read-only.
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last sign-in</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => <UserRow key={u.id} u={u} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
