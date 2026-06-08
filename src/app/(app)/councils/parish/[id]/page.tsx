import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAreaData } from "@/lib/area";
import { AreaDetail } from "@/components/AreaDetail";

export default async function ParishPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: parish } = await supabase
    .from("parishes")
    .select("id, name, district, county")
    .eq("id", id)
    .single();
  if (!parish) notFound();
  const p = parish as { id: string; name: string; district: string; county: string };

  const data = await getAreaData(supabase, [id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Parish council · {p.county}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/councils/district/${encodeURIComponent(p.district)}`} className="btn-secondary">{p.district} district</Link>
          <Link href="/councils" className="btn-secondary">All councils</Link>
        </div>
      </div>
      <AreaDetail data={data} />
    </div>
  );
}
