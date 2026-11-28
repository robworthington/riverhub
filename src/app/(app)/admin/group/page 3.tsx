import { requireTask } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupSettingsForm } from "@/components/GroupSettingsForm";

// Group settings (migration 0126): the group's public name and links (comms task) and whether
// volunteers' results wait for approval (settings task).
export default async function GroupSettingsPage() {
  const me = await requireTask("comms", "settings");
  const supabase = await createClient();
  const [{ data: group }, { data: rivers }] = await Promise.all([
    supabase
      .from("groups" as never)
      .select("id, name, slug, logo_url, website_url, donate_url, results_need_approval")
      .eq("id" as never, me.active_group_id as never)
      .maybeSingle(),
    supabase
      .from("group_rivers" as never)
      .select("organisation_id, organisations(river_name, name)")
      .eq("group_id" as never, me.active_group_id as never),
  ]);
  const g = group as unknown as {
    name: string; slug: string; logo_url: string | null; website_url: string | null; donate_url: string | null;
    results_need_approval: boolean;
  } | null;
  if (!g) return <p className="text-sm text-gray-600">You&rsquo;re not working as a member of a group.</p>;
  const riverNames = ((rivers as unknown as { organisations: { river_name: string | null; name: string } | null }[]) ?? [])
    .map((r) => r.organisations?.river_name ?? r.organisations?.name)
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Group settings</h1>
        <p className="text-sm text-gray-600">
          {g.name} works on {riverNames.length ? riverNames.join(", ") : "no rivers yet"}. River Hub adds rivers to a
          group: ask if you need another. Your public page, where people can ask to join, is{" "}
          <a className="text-river-700 hover:underline" href={`/g/${g.slug}`}>/g/{g.slug}</a>.
        </p>
      </div>
      <div className="card">
        <GroupSettingsForm
          group={{ name: g.name, logoUrl: g.logo_url ?? "", websiteUrl: g.website_url ?? "", donateUrl: g.donate_url ?? "", resultsNeedApproval: g.results_need_approval }}
          canComms={!!me.tasks?.includes("comms")}
          canSettings={!!me.tasks?.includes("settings")}
        />
      </div>
    </div>
  );
}
