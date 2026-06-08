import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAreaData } from "@/lib/area";
import { AreaDetail } from "@/components/AreaDetail";
import { ParishSelect } from "@/components/ParishSelect";

export default async function DistrictPage({ params }: { params: Promise<{ district: string }> }) {
  await requireProfile();
  const { district } = await params;
  const name = decodeURIComponent(district);
  const supabase = await createClient();

  const { data: parishes } = await supabase
    .from("parishes")
    .select("id, name")
    .eq("district", name)
    .not("boundary", "is", null)
    .order("name");
  const pList = (parishes as { id: string; name: string }[]) ?? [];
  if (!pList.length) notFound();

  const data = await getAreaData(supabase, pList.map((p) => p.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{name}</h1>
          <p className="text-xs uppercase tracking-wide text-gray-400">District council · {pList.length} parishes</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-[200px]"><ParishSelect parishes={pList} /></div>
          <Link href="/councils" className="btn-secondary">All councils</Link>
        </div>
      </div>
      <AreaDetail data={data} />
    </div>
  );
}
