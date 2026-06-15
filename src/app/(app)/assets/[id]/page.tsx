import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PermitForm } from "@/components/PermitForm";
import { SyncNowButton } from "@/components/SyncNowButton";
import { MapClient } from "@/components/MapClient";
import { SpillTrendChart } from "@/components/SpillTrendChart";
import { AssetPhotoUpload } from "@/components/AssetPhotoUpload";
import { WinepPanel, type WinepActionRow } from "@/components/WinepPanel";
import { StatusBadge, WeatherBadge, assetTypeLabel } from "@/components/edm-ui";
import { buildRainIndex, classifySpill } from "@/lib/dryspill";
import { formatDuration, eventDurationSeconds, formatHours } from "@/lib/duration";
import { getSignedUrl } from "@/lib/storage";
import type {
  AssetPermit, AssetPhoto, EdmSnapshot, SewageAsset, SewageSystem, WaterBody, SpillEvent, EdmAnnualStat,
} from "@/lib/types";

interface DrySpillRow {
  spill_event_id: string;
  asset_id: string;
  event_start: string;
  event_end: string | null;
  ongoing: boolean;
  duration_minutes: number | null;
  weather_class: "dry" | "wet" | "unknown";
  max_rain: number | null;
  flow_m3s: number | null;
}

const CAPTURES_PER_PAGE = 15;

function fmt(ts: string | null): string {
  return ts ? ts.replace("T", " ").slice(0, 16) : "—";
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10;
}

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cap?: string }>;
}) {
  const { id } = await params;
  const { cap } = await searchParams;
  const capPage = Math.max(0, Number.parseInt(cap ?? "0", 10) || 0);
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: asset } = await supabase.from("sewage_assets").select("*").eq("id", id).single();
  if (!asset) notFound();
  const a = asset as SewageAsset;

  const [{ data: system }, { data: waterBody }, { data: gauge }, { data: permits }, { data: events }, { data: annual }] =
    await Promise.all([
      a.sewage_system_id
        ? supabase.from("sewage_systems").select("*").eq("id", a.sewage_system_id).single()
        : Promise.resolve({ data: null }),
      a.water_body_id
        ? supabase.from("water_bodies").select("*").eq("id", a.water_body_id).single()
        : Promise.resolve({ data: null }),
      a.rainfall_station_id
        ? supabase.from("rainfall_stations").select("name, ea_station_id, latitude, longitude").eq("id", a.rainfall_station_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("asset_permits").select("*").eq("asset_id", id).order("permit_start_date"),
      supabase.from("spill_events").select("*").eq("asset_id", id).order("event_start", { ascending: false }).limit(20),
      supabase.from("edm_annual_stats").select("*").eq("asset_id", id).order("year"),
    ]);

  const [{ data: photos }, { data: classified }, { data: winep }] = await Promise.all([
    supabase.from("asset_photos").select("*").eq("asset_id", id).order("created_at"),
    supabase.rpc("classify_spills", { p_window: 1, p_threshold: 0.25, p_asset: id }),
    supabase.rpc("public_winep_for_asset", { p_asset_id: id }),
  ]);
  const winepActions = (winep as WinepActionRow[]) ?? [];
  const photoList = (photos as AssetPhoto[]) ?? [];
  const photoUrls = await Promise.all(
    photoList.map(async (p) => ({ id: p.id, caption: p.caption, url: await getSignedUrl(p.storage_path) })),
  );
  const drySpills = ((classified as DrySpillRow[]) ?? []).filter(
    (r) => r.asset_id === id && r.weather_class === "dry",
  );

  // paginated captures (newest first) + total count
  const { data: snaps, count: capCount } = await supabase
    .from("edm_snapshots")
    .select("*", { count: "exact" })
    .eq("asset_id", id)
    .order("captured_at", { ascending: false })
    .range(capPage * CAPTURES_PER_PAGE, capPage * CAPTURES_PER_PAGE + CAPTURES_PER_PAGE - 1);

  // rainfall from this asset's mapped gauge
  const rainQuery = supabase.from("rainfall_readings").select("reading_date, rainfall_mm");
  const { data: rain } = a.rainfall_station_id
    ? await rainQuery.eq("station_id", a.rainfall_station_id)
    : await rainQuery;
  const rainIndex = buildRainIndex((rain as { reading_date: string; rainfall_mm: number | null }[]) ?? []);

  const snapshots = (snaps as EdmSnapshot[]) ?? [];
  const spillEvents = (events as SpillEvent[]) ?? [];
  const annualStats = (annual as EdmAnnualStat[]) ?? [];
  const g = gauge as { name: string; ea_station_id: string | null; latitude: number | null; longitude: number | null } | null;
  const gaugePageUrl = g?.ea_station_id
    ? `https://environment.data.gov.uk/hydrology/id/stations/${g.ea_station_id}`
    : null;
  const latest = capPage === 0 ? snapshots[0] : undefined;

  const permitList = (permits as AssetPermit[]) ?? [];
  const permitDocUrl = new Map<string, string | null>();
  await Promise.all(
    permitList
      .filter((p) => p.permit_doc_path)
      .map(async (p) => permitDocUrl.set(p.id, await getSignedUrl(p.permit_doc_path!))),
  );

  const gaugeDist =
    g && g.latitude != null && g.longitude != null && a.latitude != null && a.longitude != null
      ? distanceKm(a.latitude, a.longitude, g.latitude, g.longitude)
      : null;

  const totalCaptures = capCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCaptures / CAPTURES_PER_PAGE));

  const confLabel: Record<string, string> = {
    high: "works catchment (high confidence)",
    medium: "nearest works ≤3 km (medium — review)",
    low: "unmatched — prior grouping (low)",
  };
  const facts: [string, string][] = [
    ["Type", assetTypeLabel(a.asset_type)],
    ["Outlet ID", a.asset_unique_id ?? "—"],
    ["Drains to (treatment works)", system ? (system as SewageSystem).name : "—"],
    ["Grouping basis", a.system_match_confidence ? (confLabel[a.system_match_confidence] ?? a.system_match_confidence) : "—"],
    ["Water body", waterBody ? (waterBody as WaterBody).label : "—"],
    ["Owner", a.asset_owner ?? "—"],
    ["Storage (m³)", a.storage_capacity != null ? String(a.storage_capacity) : "—"],
    ["Processing (m³/day)", a.processing_capacity != null ? String(a.processing_capacity) : "—"],
    ["Rain gauge", g ? `${g.name}${gaugeDist != null ? ` (${gaugeDist} km)` : ""}` : "—"],
  ];

  // dry/wet/unknown event counts per year for this asset (from the classified events)
  const eventsByYear = new Map<number, { dry: number; wet: number; unknown: number }>();
  for (const r of (classified as DrySpillRow[]) ?? []) {
    if (r.asset_id !== id) continue;
    const yr = new Date(r.event_start).getUTCFullYear();
    const e = eventsByYear.get(yr) ?? { dry: 0, wet: 0, unknown: 0 };
    e[r.weather_class]++;
    eventsByYear.set(yr, e);
  }
  const trend = annualStats.map((y) => {
    const ev = eventsByYear.get(y.year);
    return {
      year: y.year,
      spills: y.spill_count,
      hours: y.total_duration_hours != null ? Math.round(y.total_duration_hours) : null,
      dry: ev?.dry ?? null,
      wet: ev?.wet ?? null,
      unknown: ev?.unknown ?? null,
    };
  });

  const mapAssets =
    a.latitude != null && a.longitude != null
      ? [{ id: a.id, name: a.asset_name, lat: a.latitude, lng: a.longitude, status: latest?.status ?? null }]
      : [];

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

      {/* Location + photo */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Location</h2>
          {mapAssets.length ? (
            <MapClient sites={[]} assets={mapAssets} />
          ) : (
            <p className="text-sm text-gray-500">No coordinates recorded for this asset.</p>
          )}
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Photo</h2>
          {photoUrls.length ? (
            <div className="grid grid-cols-2 gap-2">
              {photoUrls.map((p) =>
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.url} alt={p.caption ?? a.asset_name} className="h-28 w-full rounded-md object-cover" />
                ) : null,
              )}
            </div>
          ) : (
            <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-400">
              No photo yet
            </div>
          )}
          <AssetPhotoUpload assetId={id} />
        </div>
      </div>

      {/* Permits */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Permits</h2>
        {permitList.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-4">Number</th>
                <th className="py-1 pr-4">Start</th>
                <th className="py-1 pr-4">Revocation</th>
                <th className="py-1 pr-4">Req. processing (m³/day)</th>
                <th className="py-1 pr-4">Req. storage (m³)</th>
                <th className="py-1 pr-4">Document</th>
              </tr>
            </thead>
            <tbody>
              {permitList.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-1 pr-4">{p.permit_number ?? "—"}</td>
                  <td className="py-1 pr-4">{p.permit_start_date ?? "—"}</td>
                  <td className="py-1 pr-4">{p.permit_revocation_date ?? "—"}</td>
                  <td className="py-1 pr-4">{p.required_processing_volume ?? "—"}</td>
                  <td className="py-1 pr-4">{p.required_storage_capacity ?? "—"}</td>
                  <td className="py-1 pr-4">
                    <span className="flex gap-3">
                      {permitDocUrl.get(p.id) ? (
                        <a href={permitDocUrl.get(p.id)!} target="_blank" rel="noopener" className="text-river-700 underline">PDF</a>
                      ) : null}
                      {p.permit_url ? (
                        <a href={p.permit_url} target="_blank" rel="noopener" className="text-river-700 underline">EA page</a>
                      ) : null}
                      {!permitDocUrl.get(p.id) && !p.permit_url ? <span className="text-gray-400">—</span> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No permits recorded.</p>
        )}
        <PermitForm assetId={id} />
      </div>

      {/* Planned improvements (WINEP) — what's promised for this works/water body, by when */}
      <WinepPanel actions={winepActions} />

      {/* Annual spill history + trend */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Spill trend — dry vs wet by year</h2>
        <p className="text-xs text-gray-400">
          Bars: spill events split by weather (dry-weather spills in red) where rainfall data exists
          (2021–2023). Line: total annual discharge duration from EA returns (2020–2024).
        </p>
        <SpillTrendChart data={trend} />
        {annualStats.length > 0 && (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-6">Year</th>
                <th className="py-1 pr-6">Spills</th>
                <th className="py-1 pr-6">Total duration</th>
                <th className="py-1 pr-6">Monitor uptime</th>
              </tr>
            </thead>
            <tbody>
              {annualStats.map((y) => (
                <tr key={y.id} className="border-t border-gray-100">
                  <td className="py-1 pr-6">{y.year}</td>
                  <td className="py-1 pr-6">{y.spill_count ?? "—"}</td>
                  <td className="py-1 pr-6">{formatHours(y.total_duration_hours)}</td>
                  <td className="py-1 pr-6 text-gray-500">{y.reporting_pct != null ? `${Math.round(y.reporting_pct)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    <td className="py-1 pr-6">{formatDuration(eventDurationSeconds(e.event_start, e.event_end, e.duration_minutes))}</td>
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

      {/* Dry-weather spill events */}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Dry-weather spill events</h2>
          {gaugePageUrl && (
            <a href={gaugePageUrl} target="_blank" rel="noopener" className="text-xs text-river-700 underline">
              Verify rainfall — EA gauge{g?.name ? `: ${g.name}` : ""} →
            </a>
          )}
        </div>
        {drySpills.length ? (
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1 pr-6">Spill start</th>
                <th className="py-1 pr-6">Spill end</th>
                <th className="py-1 pr-6">Duration</th>
                <th className="py-1 pr-6">Max rain (window)</th>
                <th className="py-1 pr-6">River flow</th>
              </tr>
            </thead>
            <tbody>
              {drySpills.map((d) => (
                <tr key={d.spill_event_id} className="border-t border-gray-100">
                  <td className="py-1 pr-6">
                    <Link href={`/assets/${id}/spills/${d.spill_event_id}`} className="text-river-700 hover:underline">{fmt(d.event_start)}</Link>
                  </td>
                  <td className="py-1 pr-6">{d.ongoing ? <span className="font-medium text-red-700">ongoing</span> : fmt(d.event_end)}</td>
                  <td className="py-1 pr-6">{formatDuration(eventDurationSeconds(d.event_start, d.event_end, d.duration_minutes))}</td>
                  <td className="py-1 pr-6">{d.max_rain != null ? `${d.max_rain} mm` : "—"}</td>
                  <td className="py-1 pr-6">{d.flow_m3s != null ? `${d.flow_m3s} m³/s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            No dry-weather spills detected for this asset (≤0.25 mm on the spill day and the day before).
          </p>
        )}
      </div>

      {/* Recent captures (sub-daily snapshots) — paginated, with rainfall + dry-spill flag */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            EDM data{totalCaptures ? ` (${totalCaptures})` : ""}
          </h2>
          {profile.role === "admin" && a.edm_enabled && <SyncNowButton />}
        </div>
        {snapshots.length ? (
          <>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="py-1 pr-4">Captured</th>
                  <th className="py-1 pr-4">Status</th>
                  <th className="py-1 pr-4">Latest event start</th>
                  <th className="py-1 pr-4">Latest event end</th>
                  <th className="py-1 pr-4">Rain — day</th>
                  <th className="py-1 pr-4">Rain — prev</th>
                  <th className="py-1 pr-4">Dry spill?</th>
                  <th className="py-1 pr-4">Feed updated</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const cls = classifySpill(s.captured_at, rainIndex, { windowDays: 1 });
                  const rainDay = cls.days[0]?.mm;
                  const rainPrev = cls.days[1]?.mm;
                  const spilling = s.status === 1;
                  return (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="whitespace-nowrap py-1 pr-4">{fmt(s.captured_at)}</td>
                      <td className="py-1 pr-4"><StatusBadge status={s.status} /></td>
                      <td className="whitespace-nowrap py-1 pr-4">{fmt(s.latest_event_start)}</td>
                      <td className="whitespace-nowrap py-1 pr-4">{fmt(s.latest_event_end)}</td>
                      <td className="py-1 pr-4">{rainDay != null ? `${rainDay} mm` : "—"}</td>
                      <td className="py-1 pr-4">{rainPrev != null ? `${rainPrev} mm` : "—"}</td>
                      <td className="py-1 pr-4">
                        {!spilling ? (
                          <span className="text-gray-400">—</span>
                        ) : cls.weatherClass === "dry" ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Dry spill</span>
                        ) : cls.weatherClass === "wet" ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Rain-driven</span>
                        ) : (
                          <span className="text-gray-400">no rain data</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-4">{fmt(s.last_updated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 text-sm">
                <span className="text-gray-500">Page {capPage + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  {capPage > 0 && (
                    <Link href={`/assets/${id}?cap=${capPage - 1}`} className="btn-secondary px-3 py-1">Newer</Link>
                  )}
                  {capPage < totalPages - 1 && (
                    <Link href={`/assets/${id}?cap=${capPage + 1}`} className="btn-secondary px-3 py-1">Older</Link>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No spill data yet{a.asset_unique_id ? "" : " (set an EDM outlet ID to enable syncing)"}.
          </p>
        )}
      </div>
    </div>
  );
}
