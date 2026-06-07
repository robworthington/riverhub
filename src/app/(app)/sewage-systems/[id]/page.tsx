import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import type { SewageSystem, SewageAsset, EdmSnapshot } from "@/lib/types";

export default async function SystemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const { data: system } = await supabase
    .from("sewage_systems")
    .select("*")
    .eq("id", id)
    .single();
  if (!system) notFound();
  const s = system as SewageSystem;

  const { data: assets } = await supabase
    .from("sewage_assets")
    .select("*")
    .eq("sewage_system_id", id)
    .order("asset_name");
  const assetList = (assets as SewageAsset[]) ?? [];

  // latest spill status per asset
  const latest = new Map<string, number | null>();
  if (assetList.length) {
    const { data: snaps } = await supabase
      .from("edm_snapshots")
      .select("asset_id, status, snapshot_date")
      .in(
        "asset_id",
        assetList.map((a) => a.id),
      )
      .order("snapshot_date", { ascending: false });
    for (const sn of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
      if (!latest.has(sn.asset_id)) latest.set(sn.asset_id, sn.status);
    }
  }

  const byType = assetList.reduce<Record<string, number>>((acc, a) => {
    const k = assetTypeLabel(a.asset_type);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <Link href="/sewage-systems" className="btn-secondary">Back to systems</Link>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-xs uppercase text-gray-400">Assets</span>
            <div className="text-gray-800">{assetList.length}</div>
          </div>
          {Object.entries(byType).map(([k, v]) => (
            <div key={k}>
              <span className="text-xs uppercase text-gray-400">{k}</span>
              <div className="text-gray-800">{v}</div>
            </div>
          ))}
        </div>
        {s.description && <p className="mt-3 text-sm text-gray-600">{s.description}</p>}
      </div>

      {!assetList.length ? (
        <p className="text-sm text-gray-500">No assets linked to this system.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Outlet ID</th>
                <th className="px-4 py-2">Latest status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assetList.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/assets/${a.id}`} className="font-medium text-river-700 hover:underline">
                      {a.asset_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{assetTypeLabel(a.asset_type)}</td>
                  <td className="px-4 py-2 text-gray-500">{a.asset_unique_id ?? "—"}</td>
                  <td className="px-4 py-2">
                    {latest.has(a.id) ? <StatusBadge status={latest.get(a.id)!} /> : <span className="text-gray-400">No data</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
