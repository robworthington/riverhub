import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupRivers, InviteToGroup, NewGroupForm, type RiverOption } from "@/components/PlatformControls";

// Every group on River Hub (migration 0131): its rivers, leads, members and open invitations.
export const dynamic = "force-dynamic";

type Group = {
  id: string; name: string; slug: string; status: string; results_need_approval: boolean;
  rivers: { id: string; name: string; slug: string; live: boolean }[]; leads: string[]; members: number; open_invites: number;
};

export default async function PlatformGroupsPage() {
  await requireOwner();
  const supabase = await createClient();
  const [{ data: groupData }, { data: riverData }] = await Promise.all([
    supabase.rpc("platform_groups" as never),
    supabase.rpc("platform_rivers" as never),
  ]);
  const groups = (groupData as unknown as Group[] | null) ?? [];
  const rivers: RiverOption[] = ((riverData as unknown as { org_id: string; river_name: string }[] | null) ?? [])
    .map((r) => ({ id: r.org_id, name: r.river_name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Groups</h1>
        <p className="text-sm text-gray-600">
          {groups.length} groups. A group can work on several rivers, and a river can have several groups. Invite a group&rsquo;s
          lead here; the lead invites everyone else from their Members page.
        </p>
      </div>
      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">New group</h2>
        <NewGroupForm />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Rivers</th>
              <th className="px-3 py-2">People</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top">
            {groups.map((g) => (
              <tr key={g.id}>
                <td className="px-3 py-2">
                  <a href={`/g/${g.slug}`} className="font-medium text-river-700 hover:underline">{g.name}</a>
                  <div className="text-xs text-gray-500">
                    /g/{g.slug}{g.status !== "active" ? ` · ${g.status}` : ""} · approval {g.results_need_approval ? "on" : "off"}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <GroupRivers groupId={g.id} groupName={g.name} attached={g.rivers.map((r) => ({ id: r.id, name: r.name }))} allRivers={rivers} />
                </td>
                <td className="space-y-1 px-3 py-2 text-xs text-gray-600">
                  <div>{g.leads.length ? <>Lead{g.leads.length > 1 ? "s" : ""}: {g.leads.join(", ")}</> : <span className="text-amber-800">No lead yet</span>}</div>
                  <div>{g.members} {g.members === 1 ? "member" : "members"}{g.open_invites ? ` · ${g.open_invites} invited` : ""}</div>
                  <InviteToGroup groupId={g.id} rivers={g.rivers.map((r) => ({ id: r.id, name: r.name }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
