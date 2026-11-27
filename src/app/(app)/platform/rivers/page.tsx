import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LiveToggle, RiverGroups, type GroupOption } from "@/components/PlatformControls";

// The owner's onboarding page (migration 0131): every river with its data, whether it's live, the
// groups working on it and any adoption requests waiting.
export const dynamic = "force-dynamic";

type River = {
  org_id: string; river_slug: string; river_name: string; region: string | null; company_name: string | null;
  live: boolean; steward: string; overflows: number | null; monitors: number | null; reporting: number | null;
  has_spills: boolean; has_ea_wq: boolean; record_refreshed_at: string | null;
  groups: { id: string; name: string; slug: string }[]; pending_adoptions: number;
};

const SHOW = { all: "All", live: "Live", offline: "Not live", nogroup: "No group", adoption: "Adoption waiting" } as const;
type Show = keyof typeof SHOW;

export default async function PlatformRiversPage({ searchParams }: { searchParams: Promise<{ show?: string; region?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const show: Show = (sp.show && sp.show in SHOW ? sp.show : "all") as Show;
  const supabase = await createClient();
  const [{ data: riverData }, { data: groupData }] = await Promise.all([
    supabase.rpc("platform_rivers" as never),
    supabase.rpc("platform_groups" as never),
  ]);
  const all = (riverData as unknown as River[] | null) ?? [];
  const groups: GroupOption[] = ((groupData as unknown as { id: string; name: string }[] | null) ?? []).map((g) => ({ id: g.id, name: g.name }));
  const regions = [...new Set(all.map((r) => r.region).filter(Boolean))] as string[];
  const rivers = all.filter((r) =>
    (!sp.region || r.region === sp.region) &&
    (show === "all" || (show === "live" && r.live) || (show === "offline" && !r.live) ||
     (show === "nogroup" && !r.groups.length) || (show === "adoption" && r.pending_adoptions > 0)));
  const href = (s: Show) => `/platform/rivers?show=${s}${sp.region ? `&region=${encodeURIComponent(sp.region)}` : ""}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rivers</h1>
        <p className="text-sm text-gray-600">
          {all.length} rivers loaded, {all.filter((r) => r.live).length} live, {all.filter((r) => r.groups.length).length} with a group.
          Rivers are loaded and checked with the import scripts (database password); this page takes them live and connects groups.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(SHOW) as Show[]).map((s) => (
          <Link key={s} href={href(s)} className={`rounded-full border px-3 py-1 ${s === show ? "border-river-700 bg-river-50 font-semibold" : "border-gray-200"}`}>
            {SHOW[s]}
          </Link>
        ))}
        <form method="get" className="ml-auto flex items-center gap-1">
          <input type="hidden" name="show" value={show} />
          <select name="region" defaultValue={sp.region ?? ""} className="input py-1 text-sm" aria-label="Region">
            <option value="">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn-secondary py-1 text-sm">Filter</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">River</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Live</th>
              <th className="px-3 py-2">Groups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top">
            {rivers.map((r) => (
              <tr key={r.org_id}>
                <td className="px-3 py-2">
                  <a href={`/r/${r.river_slug}/explore/spills`} className="font-medium text-river-700 hover:underline">{r.river_name}</a>
                  <div className="text-xs text-gray-500">{[r.region, r.company_name].filter(Boolean).join(" · ")}</div>
                  {r.pending_adoptions > 0 && (
                    <Link href="/admin/adoptions" className="text-xs font-semibold text-amber-800 hover:underline">
                      {r.pending_adoptions} adoption {r.pending_adoptions === 1 ? "request" : "requests"} waiting
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  <div>{r.overflows ?? "?"} overflows · {r.reporting ?? 0}/{r.monitors ?? 0} monitors reporting</div>
                  <div>
                    {r.has_spills ? "spill history" : <span className="text-red-700">no spill history</span>} ·{" "}
                    {r.has_ea_wq ? "EA water quality" : <span className="text-amber-800">no EA water quality</span>}
                  </div>
                  {r.record_refreshed_at && <div className="text-gray-400">summary {new Date(r.record_refreshed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className={`mb-1 text-xs font-semibold ${r.live ? "text-green-700" : "text-gray-500"}`}>{r.live ? "Live" : "Not live"}</div>
                  <LiveToggle orgId={r.org_id} live={r.live} name={r.river_name} />
                </td>
                <td className="px-3 py-2">
                  <RiverGroups orgId={r.org_id} riverName={r.river_name} attached={r.groups.map((g) => ({ id: g.id, name: g.name }))} allGroups={groups} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rivers.length && <p className="p-4 text-sm text-gray-500">No rivers match.</p>}
      </div>
    </div>
  );
}
