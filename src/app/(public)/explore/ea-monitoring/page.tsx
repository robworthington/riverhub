import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `EA water-quality monitoring — ${INSTANCE.portalName}`,
  description: `Environment Agency routine water-quality monitoring (nutrients, dissolved oxygen, pH) across the ${INSTANCE.riverName} catchment — orthophosphate, ammonia, nitrate and more, per sampling point.`,
};

// tidy display names for the EA's abbreviated determinand labels
const DET_LABEL: Record<string, string> = {
  "Orthophospht": "Orthophosphate",
  "Ammonia(N)": "Ammonia (N)",
  "Nitrate-N": "Nitrate (N)",
  "Oxygen Diss": "Dissolved oxygen",
  "Cond @ 25C": "Conductivity @ 25°C",
  "Temp Water": "Water temperature",
  "pH": "pH",
};
// determinands where a higher value is worse (sort descending) vs neutral
const HIGHER_WORSE = new Set(["Orthophospht", "Ammonia(N)", "Nitrate-N", "Cond @ 25C"]);

type Row = {
  notation: string; site_label: string | null; latitude: number | null; longitude: number | null;
  wb_name: string | null; determinand: string; unit: string | null; year: number; n: number | null;
  vmin: number | null; vmax: number | null; vmean: number | null;
  latest_sample: string | null; latest_result: number | null;
};

export default async function EaMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_ea_wq");
  const rows = (data ?? []) as Row[];

  const determinands = [...new Set(rows.map((r) => r.determinand))].sort();
  const selected = sp.d && determinands.includes(sp.d) ? sp.d : (determinands.includes("Orthophospht") ? "Orthophospht" : determinands[0]);

  // one entry per site for the selected determinand: latest reading + most recent year's mean
  const bySite = new Map<string, Row>();
  const meanBySite = new Map<string, Row>();
  for (const r of rows.filter((r) => r.determinand === selected)) {
    const cur = bySite.get(r.notation);
    if (r.latest_result != null && (!cur || (cur.latest_result == null))) bySite.set(r.notation, r);
    const m = meanBySite.get(r.notation);
    if (!m || r.year > m.year) meanBySite.set(r.notation, r);
  }
  const sites = [...meanBySite.values()];
  const unit = sites[0]?.unit ?? "";
  const worseFirst = HIGHER_WORSE.has(selected);
  sites.sort((a, b) => {
    const av = a.vmean ?? -Infinity, bv = b.vmean ?? -Infinity;
    return worseFirst ? bv - av : (a.site_label ?? "").localeCompare(b.site_label ?? "");
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-river-700 to-river-500 px-6 py-8 text-white sm:px-10">
        <h1 className="max-w-2xl text-2xl font-semibold sm:text-3xl">EA water-quality monitoring</h1>
        <p className="mt-2 max-w-2xl text-sm text-river-50">
          The Environment Agency&rsquo;s own routine laboratory monitoring across the {INSTANCE.riverName}
          catchment — nutrients (orthophosphate, ammonia, nitrate), dissolved oxygen, pH and more, by
          sampling point. This complements {INSTANCE.orgName}&rsquo;s citizen sampling with the regulator&rsquo;s
          chemistry record. Open Government Licence; Environment Agency Water Quality Archive.
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No EA monitoring data has been loaded for this catchment yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {determinands.map((d) => (
              <a
                key={d}
                href={`?d=${encodeURIComponent(d)}`}
                className={`rounded-full px-3 py-1 text-sm ${
                  d === selected ? "bg-river-700 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {DET_LABEL[d] ?? d}
              </a>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-baseline justify-between px-4 py-2">
              <h2 className="text-sm font-semibold text-gray-700">
                {DET_LABEL[selected] ?? selected}{unit ? ` (${unit})` : ""} — {sites.length} sites
              </h2>
              <span className="text-xs text-gray-400">{worseFirst ? "highest first" : "by site"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Sampling point</th>
                    <th className="px-4 py-2">Water body</th>
                    <th className="px-4 py-2 text-right">Latest</th>
                    <th className="px-4 py-2">Latest date</th>
                    <th className="px-4 py-2 text-right">Recent mean</th>
                    <th className="px-4 py-2 text-right">n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sites.map((s) => {
                    const latest = bySite.get(s.notation);
                    return (
                      <tr key={s.notation} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{s.site_label ?? s.notation}</td>
                        <td className="px-4 py-2 text-gray-500">{s.wb_name ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{latest?.latest_result ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{latest?.latest_sample ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.vmean ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{s.n ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Source: Environment Agency Water Quality Archive (routine monitoring), via the Catchment
            Based Approach data hub. &ldquo;Recent mean&rdquo; is the mean of the most recent reporting year
            with data at each point. Higher orthophosphate / ammonia / nitrate indicate nutrient
            enrichment — the pressures behind many of the catchment&rsquo;s WFD failures.
          </p>
        </>
      )}
    </div>
  );
}
