import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SyncNowButton } from "@/components/SyncNowButton";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import type { SewageAsset, EdmSnapshot } from "@/lib/types";

export default async function AssetsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: assets }, { data: snaps }] = await Promise.all([
    supabase.from("sewage_assets").select("*").order("asset_name"),
    supabase
      .from("edm_snapshots")
      .select("asset_id, status, snapshot_date")
      .order("snapshot_date", { ascending: false }),
  ]);

  // latest snapshot status per asset
  const latest = new Map<string, number | null>();
  for (const s of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
    if (!latest.has(s.asset_id)) latest.set(s.asset_id, s.status);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sewage assets</h1>
        <Link href="/assets/new" className="btn">Add asset</Link>
      </div>

      {profile.role === "admin" && (
        <div className="card">
          <SyncNowButton />
        </div>
      )}

      {!assets?.length ? (
        <p className="text-sm text-gray-500">No assets yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Outlet ID</th>
                <th className="px-4 py-2">Latest status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(assets as SewageAsset[]).map((a) => (
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
