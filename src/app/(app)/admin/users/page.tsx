import { InviteForm } from "@/components/InviteForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function UsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Invite a user</h2>
        <InviteForm />
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {((users as Profile[]) ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.full_name ?? "—"}</td>
                <td className="px-4 py-2 capitalize text-gray-500">{u.role}</td>
                <td className="px-4 py-2 text-gray-500">{u.created_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
