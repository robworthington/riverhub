import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `EA water-quality monitoring — ${INSTANCE.portalName}`,
  description: `Environment Agency per-sample water-quality monitoring across the ${INSTANCE.riverName} catchment — every EA sampling point with its full determinand history (nutrients, dissolved oxygen, ammonia, nitrate and more).`,
};

type Site = {
  notation: string; site_label: string | null; latitude: number | null; longitude: number | null;
  wb_name: string | null; determinands: string[]; n_samples: number; latest_sample: string | null;
};

export default async function EaMonitoringPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_ea_wq_sites");
  const sites = ((data ?? []) as Site[]).slice().sort((a, b) => (a.site_label ?? a.notation).localeCompare(b.site_label ?? b.notation));
  const totalSamples = sites.reduce((n, s) => n + (s.n_samples ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-river-700 to-river-500 px-6 py-8 text-white sm:px-10">
        <h1 className="max-w-2xl text-2xl font-semibold sm:text-3xl">EA water-quality monitoring</h1>
        <p className="mt-2 max-w-2xl text-sm text-river-50">
          The Environment Agency&rsquo;s own laboratory monitoring across the {INSTANCE.riverName}
          catchment — every sampling point with its full sample history (nutrients, dissolved oxygen,
          ammonia, nitrate, BOD and more). Open the site to chart any determinand over time. This
          complements {INSTANCE.orgName}&rsquo;s citizen sampling with the regulator&rsquo;s record.
          Open Government Licence; Environment Agency Water Quality Archive.
        </p>
      </section>

      {sites.length === 0 ? (
        <p className="text-sm text-gray-500">No EA monitoring data has been loaded for this catchment yet.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {sites.length} EA sampling points · {totalSamples.toLocaleString()} samples.
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Sampling point</th>
                    <th className="px-4 py-2">Water body</th>
                    <th className="px-4 py-2 text-right">Determinands</th>
                    <th className="px-4 py-2 text-right">Samples</th>
                    <th className="px-4 py-2">Latest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sites.map((s) => (
                    <tr key={s.notation} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/explore/ea-monitoring/${encodeURIComponent(s.notation)}`} className="font-medium text-river-700 hover:underline">
                          {s.site_label ?? s.notation}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-500">{s.wb_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">{s.determinands?.length ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">{(s.n_samples ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-500">{s.latest_sample ? s.latest_sample.slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Source: Environment Agency Water Quality Archive (per-sample observations), Open Government Licence.
          </p>
        </>
      )}
    </div>
  );
}
