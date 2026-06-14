import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { WinepPanel, type WinepActionRow } from "@/components/WinepPanel";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Planned improvements (WINEP) — ${INSTANCE.portalName}`,
  description: `What the water company is legally required to do for the ${INSTANCE.riverName} catchment, and by when — the Environment Agency's Water Industry National Environment Programme (WINEP) actions.`,
};

export default async function PublicImprovementsPage() {
  const supabase = createPublicClient();
  const [{ data: summary }, { data: actions }] = await Promise.all([
    supabase.rpc("public_winep_summary"),
    supabase.rpc("public_winep_actions"),
  ]);

  const sumRows = summary ?? [];
  const actionRows = (actions ?? []) as unknown as WinepActionRow[];

  const pr24 = actionRows.filter((a) => a.cycle === "PR24");
  const pr19 = actionRows.filter((a) => a.cycle !== "PR24");
  const stormOverflow = sumRows
    .filter((s) => s.cycle === "PR24")
    .reduce((n, s) => n + (s.n_storm_overflow ?? 0), 0);
  const pr19Overdue = sumRows
    .filter((s) => s.cycle === "PR19")
    .reduce((n, s) => n + (s.n_overdue ?? 0), 0);
  const nextDeadlines = sumRows
    .filter((s) => s.cycle === "PR24" && s.next_deadline)
    .map((s) => s.next_deadline as string)
    .sort();

  const stats: { label: string; value: string }[] = [
    { label: "Current commitments (PR24)", value: pr24.length.toLocaleString() },
    { label: "Storm-overflow actions", value: stormOverflow.toLocaleString() },
    { label: "Previous cycle, deadline passed", value: pr19Overdue.toLocaleString() },
    { label: "Next deadline", value: nextDeadlines[0] ? nextDeadlines[0].split("-").reverse().join("/") : "—" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-river-700 to-river-500 px-6 py-8 text-white sm:px-10">
        <h1 className="max-w-2xl text-2xl font-semibold sm:text-3xl">Planned improvements</h1>
        <p className="mt-2 max-w-2xl text-sm text-river-50">
          The Water Industry National Environment Programme (WINEP) is the set of actions the
          Environment Agency legally requires {INSTANCE.companyName ?? "the water company"} to
          complete each price-review cycle. These are {INSTANCE.riverName}-catchment actions —
          what&rsquo;s been promised, and by when. The previous cycle (AMP7, 2020–25) shows how many
          deadlines have already passed.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </section>

      {pr19Overdue > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{pr19Overdue}</strong> action{pr19Overdue === 1 ? "" : "s"} required in the previous
          cycle (AMP7, 2020–25) had a legal deadline that has now passed. Per-action delivery is not
          openly published — these flags are against the published deadline only.
        </p>
      )}

      <WinepPanel
        actions={actionRows}
        heading={`WINEP actions for the ${INSTANCE.riverName} catchment`}
        emptyText="No WINEP actions have been loaded for this catchment yet."
      />

      <p className="text-xs text-gray-400">
        Source: Environment Agency Water Industry National Environment Programme (PR24 &amp; PR19),
        decoded against the EA driver-code register. Actions are matched to catchment works and water
        bodies by name and WFD water-body id.
      </p>
    </div>
  );
}
