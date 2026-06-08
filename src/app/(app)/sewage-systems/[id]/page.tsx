import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import { SystemCapacityPanel } from "@/components/SystemCapacityPanel";
import { MapClient } from "@/components/MapClient";
import type { MapAsset } from "@/components/MapView";
import type { SewageSystem, SewageAsset, EdmSnapshot, SystemCapacity, AssetPermit } from "@/lib/types";

interface AheadRow {
  asset_id: string;
  asset_name: string | null;
  asset_type: string | null;
  total: number;
  ahead: number;
  pct: number;
}
interface AheadEvent {
  asset_id: string;
  asset_name: string | null;
  asset_type: string | null;
  event_start: string;
  event_end: string | null;
  duration_minutes: number | null;
}

export default async function SystemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; tol?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.role === "admin";
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
      .order("captured_at", { ascending: false });
    for (const sn of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
      if (!latest.has(sn.asset_id)) latest.set(sn.asset_id, sn.status);
    }
  }

  const byType = assetList.reduce<Record<string, number>>((acc, a) => {
    const k = assetTypeLabel(a.asset_type);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // population/capacity assumptions (computed view) — defaults applied if no row yet
  const { data: capRow } = await supabase
    .from("system_capacity_v")
    .select("*")
    .eq("system_id", id)
    .maybeSingle();
  const cap = capRow as SystemCapacity | null;

  // the treatment-works asset in this system carries the permit + actual capacity
  const works =
    assetList.find((a) => a.asset_type === "sewage_treatment_works") ?? null;
  let permit: AssetPermit | null = null;
  if (works) {
    const { data: pr } = await supabase
      .from("asset_permits")
      .select("*")
      .eq("asset_id", works.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    permit = pr as AssetPermit | null;
  }

  // ---- "spills ahead of the works": years available + the selected analysis ----
  const sysAssetIds = assetList.map((a) => a.id);
  const worksIds = assetList.filter((a) => a.asset_type === "sewage_treatment_works" || a.asset_type === "storm_tank").map((a) => a.id);
  const thisYear = new Date().getUTCFullYear();
  const spillYears: number[] = [];
  if (sysAssetIds.length) {
    for (let y = 2021; y <= thisYear; y++) {
      const { count } = await supabase
        .from("spill_events")
        .select("*", { count: "exact", head: true })
        .in("asset_id", sysAssetIds)
        .gte("event_start", `${y}-01-01`)
        .lt("event_start", `${y + 1}-01-01`);
      if (count && count > 0) spillYears.push(y);
    }
  }
  const aheadYears = spillYears.slice().sort((a, b) => b - a);
  const aheadYear = aheadYears.includes(Number(sp.year)) ? Number(sp.year) : (aheadYears[0] ?? thisYear);
  const aheadTol = [0, 1, 2].includes(Number(sp.tol)) ? Number(sp.tol) : 0;
  let aheadRows: AheadRow[] = [];
  let aheadEvents: AheadEvent[] = [];
  let worksEventsInYear = 0;
  if (sysAssetIds.length && aheadYears.length) {
    const [{ data: ah }, { data: ev }] = await Promise.all([
      supabase.rpc("spills_ahead_of_works", { p_system: id, p_year: aheadYear, p_tol_days: aheadTol }),
      supabase.rpc("spills_ahead_of_works_events", { p_system: id, p_year: aheadYear, p_tol_days: aheadTol }),
    ]);
    aheadRows = (ah as AheadRow[]) ?? [];
    aheadEvents = (ev as AheadEvent[]) ?? [];
    if (worksIds.length) {
      const { count } = await supabase
        .from("spill_events")
        .select("*", { count: "exact", head: true })
        .in("asset_id", worksIds)
        .gte("event_start", `${aheadYear}-01-01`)
        .lt("event_start", `${aheadYear + 1}-01-01`);
      worksEventsInYear = count ?? 0;
    }
  }
  const aheadTotal = aheadRows.reduce((a, r) => a + r.ahead, 0);
  const aheadGrand = aheadRows.reduce((a, r) => a + r.total, 0);

  // assets with coordinates → map markers (status-coloured)
  const mapAssets: MapAsset[] = assetList
    .filter((a) => a.latitude != null && a.longitude != null)
    .map((a) => ({
      id: a.id,
      name: a.asset_name,
      lat: a.latitude as number,
      lng: a.longitude as number,
      status: latest.has(a.id) ? latest.get(a.id)! : null,
    }));

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

      <SystemCapacityPanel
        systemId={id}
        isAdmin={isAdmin}
        onsPopulation={cap?.ons_population ?? null}
        onsCalculatedAt={cap?.ons_calculated_at ?? null}
        onsSource={cap?.ons_source ?? null}
        populationOverride={cap?.population_override ?? null}
        gLhd={cap?.g_lhd ?? 140}
        lowVariationPct={cap?.low_variation_pct ?? 15}
        highVariationPct={cap?.high_variation_pct ?? 50}
        infiltrationM3d={cap?.infiltration_m3d ?? 0}
        tradeEffluentM3d={cap?.trade_effluent_m3d ?? 0}
        notes={cap?.notes ?? null}
        works={
          works
            ? {
                assetId: works.id,
                assetName: works.asset_name,
                permitDwf: permit?.permit_dwf_m3d ?? permit?.required_processing_volume ?? null,
                permitFft: permit?.permit_fft_m3d ?? null,
                permitPe: permit?.permit_pe ?? null,
                actualCapacity: works.actual_capacity_m3d ?? null,
                actualCapacitySource: works.actual_capacity_source ?? null,
              }
            : null
        }
      />

      {aheadYears.length > 0 && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Spills ahead of the treatment works</h2>
              <p className="mt-1 max-w-2xl text-xs text-gray-400">
                Upstream assets (CSOs, pumping stations) that discharged on days the works&rsquo; own storm overflow
                was <strong>not</strong> spilling — i.e. the works still had capacity, so these point to a network
                hydraulic bottleneck or a premature/avoidable spill rather than a works-capacity event.
              </p>
            </div>
            <form method="get" className="flex items-end gap-2">
              <div>
                <label className="label">Year</label>
                <select name="year" defaultValue={String(aheadYear)} className="input">
                  {aheadYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tolerance</label>
                <select name="tol" defaultValue={String(aheadTol)} className="input">
                  <option value="0">Same day</option>
                  <option value="1">± 1 day</option>
                  <option value="2">± 2 days</option>
                </select>
              </div>
              <button type="submit" className="btn">Apply</button>
            </form>
          </div>

          {worksEventsInYear === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The treatment works has no EDM spill data for {aheadYear}, so &ldquo;ahead of works&rdquo; cannot be
              distinguished from normal operation — figures below assume the works never overflowed and should be
              treated with caution.
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              <strong className="text-red-700">{aheadTotal.toLocaleString()}</strong> of {aheadGrand.toLocaleString()} upstream
              spills in {aheadYear} occurred while the works was not overflowing
              {aheadTol > 0 ? ` (±${aheadTol} day tolerance)` : ""}.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="py-1 pr-6">Upstream asset</th>
                  <th className="py-1 pr-6">Type</th>
                  <th className="py-1 pr-6">Spills</th>
                  <th className="py-1 pr-6">Ahead of works</th>
                  <th className="py-1 pr-6">% ahead</th>
                </tr>
              </thead>
              <tbody>
                {aheadRows.map((r) => (
                  <tr key={r.asset_id} className="border-t border-gray-100">
                    <td className="py-1 pr-6">
                      <Link href={`/assets/${r.asset_id}`} className="text-river-700 hover:underline">{r.asset_name ?? "—"}</Link>
                    </td>
                    <td className="py-1 pr-6 text-gray-500">{assetTypeLabel(r.asset_type as never)}</td>
                    <td className="py-1 pr-6 text-gray-500">{r.total.toLocaleString()}</td>
                    <td className="py-1 pr-6 font-semibold text-red-700">{r.ahead.toLocaleString()}</td>
                    <td className="py-1 pr-6">
                      <span className={`font-semibold ${r.pct >= 50 ? "text-red-700" : r.pct >= 25 ? "text-amber-700" : "text-gray-600"}`}>{r.pct}%</span>
                    </td>
                  </tr>
                ))}
                {!aheadRows.length && <tr><td className="py-1 text-gray-500">No upstream spills for {aheadYear}.</td></tr>}
              </tbody>
            </table>
          </div>

          {aheadEvents.length > 0 && (
            <details className="rounded-md border border-gray-200">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
                Dates of spills ahead of the works{aheadEvents.length >= 1000 ? ` (most recent ${aheadEvents.length})` : ` (${aheadEvents.length})`}
              </summary>
              <div className="max-h-96 overflow-auto border-t border-gray-100">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Spill start</th>
                      <th className="px-3 py-2">Asset</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {aheadEvents.map((e, i) => (
                      <tr key={`${e.asset_id}-${e.event_start}-${i}`} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-1.5">{e.event_start.replace("T", " ").slice(0, 16)}</td>
                        <td className="px-3 py-1.5">
                          <Link href={`/assets/${e.asset_id}`} className="text-river-700 hover:underline">{e.asset_name ?? "—"}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{assetTypeLabel(e.asset_type as never)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">
                          {e.duration_minutes != null ? `${(e.duration_minutes / 60).toFixed(1)} h` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

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

      {mapAssets.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">Asset map</h2>
          <MapClient sites={[]} assets={mapAssets} height="360px" zoom={12} />
          <p className="mt-2 text-xs text-gray-400">
            {mapAssets.length} of {assetList.length} assets geolocated · red = spilling, green = not
            spilling, amber = monitor offline, grey = no data.
          </p>
        </div>
      )}
    </div>
  );
}
