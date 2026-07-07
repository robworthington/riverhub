import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";

interface ResultDetail {
  id: string;
  date_collected: string;
  time_collected: string | null;
  result: number | null;
  result_class: string | null;
  condition: "wet" | "dry" | null;
  rainfall: number | null;
  temperature_c: number | null;
  salinity_ppt: number | null;
  person_collecting: string | null;
  organisation_collecting: string | null;
  other_observations: string | null;
  chain_of_custody_path: string | null;
  site_id: string;
  test_sites: { name: string } | null;
  test_types: { test_name: string; primary_unit: string | null } | null;
}

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("test_results")
    .select("*, test_sites(name), test_types(test_name, primary_unit)")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const r = data as unknown as ResultDetail;
  const cocUrl = r.chain_of_custody_path ? await getSignedUrl(r.chain_of_custody_path) : null;

  const facts: [string, string][] = [
    ["Date", `${r.date_collected}${r.time_collected ? ` ${r.time_collected}` : ""}`],
    ["Test", r.test_types?.test_name ?? "—"],
    ["Result", r.result != null ? `${r.result}${r.test_types?.primary_unit ? ` ${r.test_types.primary_unit}` : ""}` : "—"],
    ...(r.result_class ? [["Risk rating", r.result_class] as [string, string]] : []),
    ["Temperature", r.temperature_c != null ? `${r.temperature_c} °C` : "—"],
    ["Salinity", r.salinity_ppt != null ? `${r.salinity_ppt} ppt` : "—"],
    ["Condition", r.condition ? r.condition[0].toUpperCase() + r.condition.slice(1) : "—"],
    ["Rainfall", r.rainfall != null ? String(r.rainfall) : "—"],
    ["Collected by", r.person_collecting ?? "—"],
    ["Organisation", r.organisation_collecting ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Result — <Link href={`/sites/${r.site_id}`} className="text-river-700 hover:underline">{r.test_sites?.name}</Link>
        </h1>
        <Link href="/results" className="btn-secondary">Back to results</Link>
      </div>
      <div className="card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-gray-400">{k}</dt>
              <dd className="text-sm text-gray-800">{v}</dd>
            </div>
          ))}
        </dl>
        {r.other_observations && <p className="mt-4 text-sm text-gray-600">{r.other_observations}</p>}
        {cocUrl && (
          <p className="mt-4 text-sm">
            <a href={cocUrl} target="_blank" rel="noopener" className="text-river-700 underline">
              View chain of custody
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
