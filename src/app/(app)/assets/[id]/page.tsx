import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PermitForm } from "@/components/PermitForm";
import { SyncNowButton } from "@/components/SyncNowButton";
import { StatusBadge, WeatherBadge, assetTypeLabel } from "@/components/edm-ui";
import { buildRainIndex, classifySpill } from "@/lib/dryspill";
import type {
  AssetPermit, EdmSnapshot, SewageAsset, SewageSystem, WaterBody, SpillEvent, EdmAnnualStat,
} from "@/lib/types";

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

  const [{ data: system }, { data: waterBody }, { data: permits }, { data: snaps }, { data: events }, { data: annual }] =
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
        .order("captured_at", { ascending: false })
        .limit(20),
      supabase
        .from("spill_events")
        .select("*")
        .eq("asset_id", id)
        .order("event_start", { ascending: false })
        .limit(20),
      supabase.from("edm_annual_stats").select("*").eq("asset_id", id).order("year"),
    ]);

  const { data: rain } = await supabase
    .from("rainfall_readings")
    .select("reading_date, rainfall_mm");
  const rainIndex = buildRainIndex(
    (rain as { reading_date: string; rainfall_mm: number | null }[]) ?? [],
  );

  const snapshots = (snaps as EdmSnapshot[]) ?? [];
  const spillEvents = (events as SpillEvent[]) ?? [];
  const annualStats = (annual as EdmAnnualStat[]) ?? [];
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

      {/* Annual spill history (EA returns) */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Annual spill history (EA returns)</h2>
        {annualStats.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-6">Year</th>
                <th className="py-1 pr-6">Spills</th>
                <th className="py-1 pr-6">Total duration (h)</th>
                <th className="py-1 pr-6">Monitor uptime</th>
              </tr>
            </thead>
            <tbody>
              {annualStats.map((y) => (
                <tr key={y.id} className="border-t border-gray-100">
                  <td className="py-1 pr-6">{y.year}</td>
                  <td className="py-1 pr-6">{y.spill_count ?? "—"}</td>
                  <td className="py-1 pr-6">{y.total_duration_hours != null ? Math.round(y.total_duration_hours) : "—"}</td>
                  <td className="py-1 pr-6 text-gray-500">{y.reporting_pct != null ? `${Math.round(y.reporting_pct)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No annual-return history for this asset.</p>
        )}
      </div>

      {/* Reconstructed spill events */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Recent spill events</h2>
        {spillEvents.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-6">Started</th>
                <th className="py-1 pr-6">Ended</th>
                <th className="py-1 pr-6">Duration</th>
                <th className="py-1 pr-6">Weather</th>
              </tr>
            </thead>
            <tbody>
              {spillEvents.map((e) => {
                const cls = classifySpill(e.event_start, rainIndex);
                return (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="py-1 pr-6">{fmt(e.event_start)}</td>
                    <td className="py-1 pr-6">{e.ongoing ? <span className="font-medium text-red-700">ongoing</span> : fmt(e.event_end)}</td>
                    <td className="py-1 pr-6">{e.duration_minutes != null ? `${(e.duration_minutes / 60).toFixed(1)} h` : "—"}</td>
                    <td className="py-1 pr-6"><WeatherBadge weatherClass={cls.weatherClass} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No spill events recorded yet (built up from each sync).</p>
        )}
      </div>

      {/* Recent captures (sub-daily snapshots) */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent captures</h2>
          {profile.role === "admin" && a.edm_enabled && <SyncNowButton />}
        </div>
        {snapshots.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-4">Captured</th>
                <th className="py-1 pr-4">Status</th>
                <th className="py-1 pr-4">Latest event start</th>
                <th className="py-1 pr-4">Latest event end</th>
                <th className="py-1 pr-4">Feed updated</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{fmt(s.captured_at)}</td>
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
