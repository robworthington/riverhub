import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PermitForm } from "@/components/PermitForm";
import { SyncNowButton } from "@/components/SyncNowButton";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import type { AssetPermit, EdmSnapshot, SewageAsset, SewageSystem, WaterBody } from "@/lib/types";

function fmt(ts: string | null): string {
  return ts ? ts.replace("T", " ").slice(0, 16) : "—";
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: asset } = await supabase.from("sewage_assets").select("*").eq("id", id).single();
  if (!asset) notFound();
  const a = asset as SewageAsset;

  const [{ data: system }, { data: waterBody }, { data: permits }, { data: snaps }] =
    await Promise.all([
      a.sewage_system_id
        ? supabase.from("sewage_systems").select("*").eq("id", a.sewage_system_id).single()
        : Promise.resolve({ data: null }),
      a.water_body_id
        ? supabase.from("water_bodies").select("*").eq("id", a.water_body_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("asset_permits").select("*").eq("asset_id", id).order("permit_start_date"),
      supabase
        .from("edm_snapshots")
        .select("*")
        .eq("asset_id", id)
        .order("snapshot_date", { ascending: false })
        .limit(30),
    ]);

  const snapshots = (snaps as EdmSnapshot[]) ?? [];
  const latest = snapshots[0];

  const facts: [string, string][] = [
    ["Type", assetTypeLabel(a.asset_type)],
    ["Outlet ID", a.asset_unique_id ?? "—"],
    ["System", system ? (system as SewageSystem).name : "—"],
    ["Water body", waterBody ? (waterBody as WaterBody).label : "—"],
    ["Owner", a.asset_owner ?? "—"],
    ["Storage (m³)", a.storage_capacity != null ? String(a.storage_capacity) : "—"],
    ["Processing (m³/day)", a.processing_capacity != null ? String(a.processing_capacity) : "—"],
    ["EDM feed", a.edm_enabled ? "Enabled" : "Disabled"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{a.asset_name}</h1>
          {latest && <StatusBadge status={latest.status} />}
        </div>
        <Link href={`/assets/${id}/edit`} className="btn-secondary">Edit</Link>
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
      </div>

      {/* Permits */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Permits</h2>
        {(permits as AssetPermit[])?.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-4">Number</th>
                <th className="py-1 pr-4">Start</th>
                <th className="py-1 pr-4">Revocation</th>
                <th className="py-1 pr-4">Req. processing (m³/day)</th>
                <th className="py-1 pr-4">Req. storage (m³)</th>
              </tr>
            </thead>
            <tbody>
              {(permits as AssetPermit[]).map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{p.permit_number ?? "—"}</td>
                  <td className="py-1 pr-4">{p.permit_start_date ?? "—"}</td>
                  <td className="py-1 pr-4">{p.permit_revocation_date ?? "—"}</td>
                  <td className="py-1 pr-4">{p.required_processing_volume ?? "—"}</td>
                  <td className="py-1 pr-4">{p.required_storage_capacity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No permits recorded.</p>
        )}
        <PermitForm assetId={id} />
      </div>

      {/* Spill data */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Spill data (EDM snapshots)</h2>
          {profile.role === "admin" && a.edm_enabled && <SyncNowButton />}
        </div>
        {snapshots.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-4">Date</th>
                <th className="py-1 pr-4">Status</th>
                <th className="py-1 pr-4">Latest event start</th>
                <th className="py-1 pr-4">Latest event end</th>
                <th className="py-1 pr-4">Feed updated</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{s.snapshot_date}</td>
                  <td className="py-1 pr-4"><StatusBadge status={s.status} /></td>
                  <td className="py-1 pr-4">{fmt(s.latest_event_start)}</td>
                  <td className="py-1 pr-4">{fmt(s.latest_event_end)}</td>
                  <td className="py-1 pr-4">{fmt(s.last_updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            No spill data yet{a.asset_unique_id ? "" : " (set an EDM outlet ID to enable syncing)"}.
          </p>
        )}
      </div>
    </div>
  );
}
