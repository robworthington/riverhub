import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { TimeSeriesChart, type ChartPoint } from "@/components/TimeSeriesChart";
import { EaDeterminandSelect } from "@/components/EaDeterminandSelect";

export const revalidate = 3600;

type Sample = { determinand: string; unit: string | null; result: number | null; sampled_at: string; purpose: string | null };
type Site = { notation: string; site_label: string | null; latitude: number | null; longitude: number | null; wb_name: string | null; determinands: string[]; n_samples: number; latest_sample: string | null };

export async function generateMetadata({ params }: { params: Promise<{ notation: string }> }): Promise<Metadata> {
  const { notation } = await params;
  return { title: `EA monitoring — ${decodeURIComponent(notation)} — ${INSTANCE.portalName}` };
}

function fmt(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

export default async function EaSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ notation: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { notation } = await params;
  const note = decodeURIComponent(notation);
  const sp = await searchParams;
  const supabase = createPublicClient();

  const [{ data: sitesData }, { data: sampleData }] = await Promise.all([
    supabase.rpc("public_ea_wq_sites"),
    supabase.rpc("public_ea_wq_site_samples", { p_notation: note }),
  ]);
  const site = ((sitesData ?? []) as Site[]).find((s) => s.notation === note);
  const samples = (sampleData ?? []) as Sample[];
  if (!site && samples.length === 0) notFound();

  // determinands at this site, by sample count (descending)
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.determinand, (counts.get(s.determinand) ?? 0) + 1);
  const determinands = [...counts.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const selected = sp.d && counts.has(sp.d) ? sp.d : determinands[0]?.name ?? "";

  const forDet = samples.filter((s) => s.determinand === selected);
  const unit = forDet.find((s) => s.unit)?.unit ?? "";
  const points: ChartPoint[] = forDet
    .filter((s) => s.result != null)
    .map((s) => ({ t: new Date(s.sampled_at).getTime(), value: Number(s.result), label: fmt(s.sampled_at) }))
    .sort((a, b) => a.t - b.t);
  const rows = forDet.slice().sort((a, b) => b.sampled_at.localeCompare(a.sampled_at));

  return (
    <div className="space-y-5">
      <Link href="/explore/ea-monitoring" className="text-sm text-river-700 hover:underline">← EA monitoring</Link>

      <div className="card">
        <p className="text-xs uppercase tracking-wide text-gray-400">Environment Agency monitoring point</p>
        <h1 className="mt-1 text-xl font-semibold">{site?.site_label ?? note}</h1>
        <p className="mt-1 text-sm text-gray-600">
          EA sampling point {note}
          {site?.wb_name ? ` · ${site.wb_name}` : ""}
          {` · ${samples.length.toLocaleString()} samples`}
          {determinands.length ? ` · ${determinands.length} determinands` : ""}
          {site?.latest_sample ? ` · latest ${site.latest_sample.slice(0, 10)}` : ""}
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">{selected}{unit ? ` (${unit})` : ""} over time</h2>
          <EaDeterminandSelect notation={note} determinands={determinands} current={selected} />
        </div>
        {points.length > 0 ? (
          <TimeSeriesChart points={points} unit={unit} thresholds={[]} />
        ) : (
          <p className="text-sm text-gray-500">No numeric results to plot for this determinand (values may be below detection limit).</p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Samples — {selected}</h2>
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-4">Date</th>
                <th className="py-1 pr-4 text-right">Result</th>
                <th className="py-1 pr-4">Unit</th>
                <th className="py-1 pr-4">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{fmt(r.sampled_at)}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{r.result ?? "—"}</td>
                  <td className="py-1 pr-4 text-gray-500">{r.unit ?? "—"}</td>
                  <td className="py-1 pr-4 text-gray-500">{r.purpose ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Source: Environment Agency Water Quality Archive (per-sample observations), Open Government
        Licence. Regulator monitoring — complements {INSTANCE.orgName}&rsquo;s citizen sampling.
      </p>
    </div>
  );
}
