import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import type { Parish, SitePhoto, TestSite, WaterBody } from "@/lib/types";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase.from("test_sites").select("*").eq("id", id).single();
  if (!site) notFound();
  const s = site as TestSite;

  const [{ data: parish }, { data: waterBody }, { data: photos }] = await Promise.all([
    s.parish_id
      ? supabase.from("parishes").select("*").eq("id", s.parish_id).single()
      : Promise.resolve({ data: null }),
    s.water_body_id
      ? supabase.from("water_bodies").select("*").eq("id", s.water_body_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("site_photos").select("*").eq("site_id", id).order("created_at"),
  ]);

  const photoUrls = await Promise.all(
    ((photos as SitePhoto[]) ?? []).map(async (p) => ({
      ...p,
      url: await getSignedUrl(p.storage_path),
    })),
  );

  const facts: [string, string][] = [
    ["Code", s.site_code ?? "—"],
    ["Type", s.type === "bathing_water" ? "Bathing water" : s.type === "community_designated" ? "Community designated" : "—"],
    ["Parish", parish ? `${(parish as Parish).name} (${(parish as Parish).county})` : "—"],
    ["Water body", waterBody ? (waterBody as WaterBody).label : "—"],
    ["Coordinates", s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : "—"],
    ["What3Words", s.what_three_words ?? "—"],
    ["Tidal", s.tidal ? "Yes" : "No"],
    ["Access point", s.access_point ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <div className="flex gap-2">
          <Link href={`/sites/${id}/edit`} className="btn-secondary">Edit</Link>
          <Link href={`/results/new?site=${id}`} className="btn">Record sample here</Link>
        </div>
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
        {s.description && <p className="mt-4 text-sm text-gray-600">{s.description}</p>}
      </div>

      {photoUrls.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photoUrls.map((p) =>
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={p.caption ?? s.name} className="h-32 w-full rounded-md object-cover" />
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
