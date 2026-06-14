import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assetTypeLabel, WeatherBadge } from "@/components/edm-ui";
import { EvidenceMap } from "@/components/EvidenceMap";
import { PrintButton } from "@/components/PrintButton";
import {
  buildRainIndex, classifySpill, EA_THRESHOLD_MM, METHODOLOGY_URL, METHODOLOGY_VERSION,
  type WeatherClass,
} from "@/lib/dryspill";
import { formatDuration, eventDurationSeconds } from "@/lib/duration";
import { INSTANCE } from "@/lib/instance";
import type { SewageAsset, SewageSystem, WaterBody, Parish, RainfallStation } from "@/lib/types";

const WORKS_TYPES: ("sewage_treatment_works" | "storm_tank")[] = ["sewage_treatment_works", "storm_tank"];
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "full" });

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default async function SpillDossierPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  await requireProfile();
  const { id, eventId } = await params;
  const supabase = await createClient();

  const { data: ev } = await supabase.from("spill_events").select("*").eq("id", eventId).single();
  if (!ev || ev.asset_id !== id) notFound();
  const { data: assetRow } = await supabase.from("sewage_assets").select("*").eq("id", id).single();
  if (!assetRow) notFound();
  const a = assetRow as SewageAsset;

  const spillDay = (ev.event_start as string).slice(0, 10);
  const start = new Date(spillDay + "T00:00:00Z");
  const from = new Date(start); from.setUTCDate(from.getUTCDate() - 4);
  const fromDay = from.toISOString().slice(0, 10);

  const [{ data: system }, { data: wb }, { data: parish }, { data: gaugeRow }, { data: rain }, { data: flow }, { data: annual }, { data: worksAssets }] =
    await Promise.all([
      a.sewage_system_id ? supabase.from("sewage_systems").select("name").eq("id", a.sewage_system_id).single() : Promise.resolve({ data: null }),
      a.water_body_id ? supabase.from("water_bodies").select("label").eq("id", a.water_body_id).single() : Promise.resolve({ data: null }),
      a.parish_id ? supabase.from("parishes").select("name, district").eq("id", a.parish_id).single() : Promise.resolve({ data: null }),
      a.rainfall_station_id ? supabase.from("rainfall_stations").select("*").eq("id", a.rainfall_station_id).single() : Promise.resolve({ data: null }),
      a.rainfall_station_id
        ? supabase.from("rainfall_readings").select("reading_date, rainfall_mm").eq("station_id", a.rainfall_station_id).gte("reading_date", fromDay).lte("reading_date", spillDay).order("reading_date")
        : Promise.resolve({ data: [] }),
      supabase.from("flow_readings").select("flow_m3s, gauge_id").eq("reading_date", spillDay).limit(1),
      supabase.from("edm_annual_stats").select("spill_count, total_duration_hours").eq("asset_id", id).eq("year", Number(spillDay.slice(0, 4))).limit(1),
      a.sewage_system_id ? supabase.from("sewage_assets").select("id").eq("sewage_system_id", a.sewage_system_id).in("asset_type", WORKS_TYPES) : Promise.resolve({ data: [] }),
    ]);

  const g = gaugeRow as RainfallStation | null;
  const distanceKm = g && a.latitude != null && a.longitude != null && g.latitude != null && g.longitude != null
    ? haversineKm(a.latitude, a.longitude, g.latitude, g.longitude) : null;

  const rainIndex = buildRainIndex((rain as { reading_date: string; rainfall_mm: number | null }[]) ?? []);
  const windows: { days: number; klass: WeatherClass }[] = [1, 3, 4].map((w) => ({
    days: w, klass: classifySpill(ev.event_start as string, rainIndex, { windowDays: w, thresholdMm: EA_THRESHOLD_MM }).weatherClass,
  }));
  const primary = windows[0].klass;
  const dailyRain = classifySpill(ev.event_start as string, rainIndex, { windowDays: 4 }).days; // spill day + 4 preceding

  // ahead-of-works: was the system's treatment works' own overflow active that day?
  const worksIds = ((worksAssets as { id: string }[]) ?? []).map((w) => w.id);
  let aheadOfWorks: boolean | null = null;
  if (worksIds.length) {
    const { count } = await supabase
      .from("spill_events").select("*", { count: "exact", head: true })
      .in("asset_id", worksIds).gte("event_start", `${spillDay}T00:00:00Z`).lt("event_start", `${spillDay}T23:59:59Z`);
    aheadOfWorks = (count ?? 0) === 0; // works overflow shut that day → upstream spill was avoidable
  }
  const isUpstream = a.asset_type === "combined_sewer_overflow" || a.asset_type === "pumping_station";

  const flowM3s = (flow as { flow_m3s: number | null }[] | null)?.[0]?.flow_m3s ?? null;
  const annualRow = (annual as { spill_count: number | null; total_duration_hours: number | null }[] | null)?.[0];
  const durationSecs = eventDurationSeconds(ev.event_start as string, ev.event_end as string | null, ev.duration_minutes as number | null);
  const eaGaugeUrl = g?.ea_station_id ? `https://check-for-flooding.service.gov.uk/rainfall-station/${g.ea_station_id}` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2 no-print">
        <Link href={`/assets/${id}`} className="text-sm text-river-700 hover:underline">← {a.asset_name}</Link>
        <PrintButton />
      </div>

      <div className="card print-plain space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-400">{INSTANCE.orgName} — spill evidence dossier</p>
        <h1 className="text-xl font-semibold">{a.asset_name}</h1>
        <p className="text-sm text-gray-600">
          {assetTypeLabel(a.asset_type)}{a.asset_unique_id ? ` · ${a.asset_unique_id}` : ""}
          {system ? ` · ${(system as SewageSystem).name}` : ""}
        </p>
        <div className="pt-1"><WeatherBadge weatherClass={primary} /></div>
      </div>

      <div className="card print-plain">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">The discharge</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact k="Spill day" v={fmtDate(ev.event_start as string)} />
          <Fact k="Started" v={fmtDateTime(ev.event_start as string)} />
          <Fact k="Ended" v={ev.ongoing ? "ongoing" : fmtDateTime(ev.event_end as string | null)} />
          <Fact k="Duration" v={formatDuration(durationSecs, { long: true })} />
          <Fact k="Receiving water" v={wb ? (wb as WaterBody).label : "—"} />
          <Fact k="Parish" v={parish ? (parish as Parish).name : "—"} />
        </dl>
      </div>

      <div className="card print-plain">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Rainfall evidence</h2>
        <p className="mb-3 text-xs text-gray-400">
          Daily rainfall at the matched gauge{g ? ` (${g.name})` : ""} for the spill day and the preceding days.
          A spill is <strong>dry</strong> when every day in the window is ≤ {EA_THRESHOLD_MM} mm.
        </p>
        <div className="flex flex-wrap gap-4">
          {windows.map((w) => (
            <div key={w.days} className="text-sm">
              <span className="text-gray-500">{w.days}-day window: </span>
              <WeatherBadge weatherClass={w.klass} />
            </div>
          ))}
        </div>
        <table className="mt-3 min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr><th className="py-1 pr-6">Date</th><th className="py-1 pr-6">Rainfall</th><th className="py-1 pr-6"></th></tr>
          </thead>
          <tbody>
            {dailyRain.map((d, i) => (
              <tr key={d.date} className="border-t border-gray-100">
                <td className="py-1 pr-6">{new Date(d.date).toLocaleDateString("en-GB")}{i === 0 ? " (spill day)" : ""}</td>
                <td className="py-1 pr-6">{d.mm == null ? <span className="text-gray-400">no data</span> : `${d.mm} mm`}</td>
                <td className="py-1 pr-6">{d.mm != null && d.mm > EA_THRESHOLD_MM ? <span className="text-green-700">rain</span> : d.mm != null ? <span className="text-red-700">dry</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">
          River flow that day: {flowM3s != null ? `${flowM3s} m³/s` : "—"}.
          {eaGaugeUrl && <> Verify at the <a href={eaGaugeUrl} className="text-river-700 underline" target="_blank" rel="noopener">EA rainfall station</a>.</>}
        </p>
      </div>

      {g && a.latitude != null && a.longitude != null && (
        <div className="card print-plain">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Gauge proximity</h2>
          <p className="mb-3 text-xs text-gray-400">
            Outlet (red) vs matched rain gauge (blue){distanceKm != null ? `, ${distanceKm.toFixed(1)} km apart` : ""}. Closer = more representative.
          </p>
          <EvidenceMap
            asset={{ lat: a.latitude, lng: a.longitude, label: a.asset_name }}
            gauge={g.latitude != null && g.longitude != null ? { lat: g.latitude, lng: g.longitude, label: g.name } : null}
            distanceKm={distanceKm}
          />
        </div>
      )}

      <div className="card print-plain">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Severity &amp; context</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact k="Bathing water" v={a.bathing_water ?? "Not a bathing-water overflow"} flag={!!a.bathing_water} />
          <Fact k="Shellfish water" v={a.shellfish_water ?? "Not a shellfish-water overflow"} flag={!!a.shellfish_water} />
          {isUpstream && (
            <Fact
              k="Ahead of the works"
              v={aheadOfWorks == null ? "Unknown (no works overflow data)"
                : aheadOfWorks ? "Yes — the treatment works' own overflow was shut that day (capacity was available; avoidable)"
                : "No — the works was also overflowing that day"}
              flag={aheadOfWorks === true}
            />
          )}
          {annualRow && (
            <Fact k={`EA annual return (${spillDay.slice(0, 4)})`}
              v={`${annualRow.spill_count ?? "—"} counted spills · ${annualRow.total_duration_hours != null ? Math.round(annualRow.total_duration_hours) + " h" : "—"} total`} />
          )}
        </dl>
        <p className="mt-3 text-xs text-gray-400">
          The EA 12/24-hour count is the regulator&rsquo;s headline; this dossier is the per-event,
          precautionary view (duration, antecedent-dry window, receptor proximity, avoidability).
        </p>
      </div>

      <div className="card print-plain text-xs text-gray-500">
        <p>
          <strong>Method &amp; provenance.</strong> Dry/wet classification per{" "}
          <a href={METHODOLOGY_URL} className="text-river-700 underline">DRY-SPILL-METHOD.md</a> ({METHODOLOGY_VERSION}):
          ≤ {EA_THRESHOLD_MM} mm on the spill day and each preceding day of the window.
          Spill data: Environment Agency EDM (outlet {a.asset_unique_id ?? "—"}). Rainfall: EA Hydrology
          {g ? ` gauge ${g.ea_station_id ?? g.name}` : " (no gauge matched)"}. A dry spill is{" "}
          <em>presumptively non-compliant</em> (UWWTR 1994 Reg 4(4)), not proof of an offence — we test the
          rainfall limb, not pass-forward flow. Generated by {INSTANCE.portalName}.
        </p>
      </div>
    </div>
  );
}

function Fact({ k, v, flag }: { k: string; v: string; flag?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase text-gray-400">{k}</dt>
      <dd className={`text-sm ${flag ? "font-semibold text-red-700" : "text-gray-800"}`}>{v}</dd>
    </div>
  );
}
