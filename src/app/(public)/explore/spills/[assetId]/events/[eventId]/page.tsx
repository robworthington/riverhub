import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { EvidenceMap } from "@/components/EvidenceMap";
import { Chip } from "@/components/public/Chip";
import { assembleEvidence, type EvidenceRaw } from "@/lib/spill-evidence";
import { EA_THRESHOLD_MM, type ConfidenceLevel, type WeatherClass } from "@/lib/dryspill";
import { formatDuration } from "@/lib/duration";
import { OverflowName } from "@/components/public/OverflowName";
import { overflowLabel } from "@/lib/overflowNames";
import { overflowKind } from "@/lib/spillStatus";

export const revalidate = 3600;

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "full" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

// Shape of the public_spill_evidence(event) JSON payload.
type EvidenceJson = {
  event: { id: string; start: string; end: string | null; ongoing: boolean; duration_minutes: number | null };
  asset: { id: string; name: string; type: string | null; unique_id: string | null; lat: number | null; lng: number | null; bathing_water: string | null; shellfish_water: string | null };
  system: string | null;
  receiving_water: string | null;
  parish: string | null;
  gauge: { name: string; ea_station_id: string | null; lat: number | null; lng: number | null } | null;
  daily_rain: { reading_date: string; rainfall_mm: number | null }[];
  flow_m3s: number | null;
  annual: { spill_count: number | null; total_duration_hours: number | null; reporting_pct: number | null } | null;
  has_works: boolean;
  works_spilled_that_day: boolean;
};

function toRaw(j: EvidenceJson): EvidenceRaw {
  return {
    event: { id: j.event.id, start: j.event.start, end: j.event.end, ongoing: j.event.ongoing, durationMinutes: j.event.duration_minutes },
    asset: { id: j.asset.id, name: j.asset.name, type: j.asset.type, uniqueId: j.asset.unique_id, lat: j.asset.lat, lng: j.asset.lng, bathingWater: j.asset.bathing_water, shellfishWater: j.asset.shellfish_water },
    system: j.system,
    receivingWater: j.receiving_water,
    parish: j.parish,
    gauge: j.gauge ? { name: j.gauge.name, eaStationId: j.gauge.ea_station_id, lat: j.gauge.lat, lng: j.gauge.lng } : null,
    dailyRain: j.daily_rain ?? [],
    flowM3s: j.flow_m3s,
    annual: j.annual ? { spillCount: j.annual.spill_count, totalDurationHours: j.annual.total_duration_hours, reportingPct: j.annual.reporting_pct } : null,
    hasWorks: j.has_works,
    worksSpilledThatDay: j.works_spilled_that_day,
  };
}

const classChip = (k: WeatherClass) =>
  k === "dry" ? <Chip variant="dry">Dry spill</Chip> : k === "wet" ? <Chip variant="wet">Wet weather</Chip> : <Chip variant="quiet">No rain data</Chip>;

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spill_evidence" as never, { p_event: eventId } as never);
  const j = (data ?? null) as unknown as EvidenceJson | null;
  return { title: j ? `Spill evidence — ${overflowLabel(j.asset.name)} — ${INSTANCE.portalName}` : `Spill evidence — ${INSTANCE.portalName}` };
}

export default async function PublicSpillDossierPage({ params }: { params: Promise<{ assetId: string; eventId: string }> }) {
  const { assetId, eventId } = await params;
  const supabase = createPublicClient();

  const { data } = await supabase.rpc("public_spill_evidence" as never, { p_event: eventId } as never);
  const j = (data ?? null) as unknown as EvidenceJson | null;
  if (!j || j.asset.id !== assetId) notFound();

  const e = assembleEvidence(toRaw(j));
  const year = e.event.start.slice(0, 4);

  const confCls: Record<ConfidenceLevel, string> = {
    High: "bg-rh-alarmTint text-rh-alarm border-[#e8b6ae]",
    Medium: "bg-amber-50 text-amber-700 border-amber-200",
    Low: "bg-rh-well text-rh-ink3 border-rh-line",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-2">
      <Link href={`/explore/spills/${assetId}`} className="text-[13px] font-semibold text-rh-teal hover:underline">← {overflowLabel(e.asset.name)}</Link>

      {/* header */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">Spill evidence · {INSTANCE.orgName}</p>
        <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-rh-ink"><OverflowName raw={e.asset.name} chip={false} /></h1>
        <div className="mt-1 text-[13px] text-rh-ink2">
          {overflowKind(e.asset.uniqueId, e.asset.type)}{e.asset.uniqueId ? ` · ${e.asset.uniqueId}` : ""}{e.system ? ` · feeds ${e.system}` : ""}
        </div>
        <div className="mt-3">{classChip(e.primaryClass)}</div>
      </div>

      {/* evidence strength (dry only) */}
      {e.primaryClass === "dry" && (
        <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-rh-ink">Evidence strength</h2>
            <span className={`inline-flex rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold ${confCls[e.confidence.level]}`}>{e.confidence.level} confidence</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ul className="space-y-1 text-[13px] text-rh-ink2">{e.confidence.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
            {e.confidence.caveats.length > 0 && (
              <ul className="space-y-1 text-[13px] text-amber-700">{e.confidence.caveats.map((c) => <li key={c}>⚠ {c}</li>)}</ul>
            )}
          </div>
        </div>
      )}

      {/* the discharge */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="mb-3 text-[15px] font-bold text-rh-ink">The discharge</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact k="Spill day" v={fmtDate(e.event.start)} />
          <Fact k="Started" v={fmtDateTime(e.event.start)} />
          <Fact k="Ended" v={e.event.ongoing ? "ongoing" : fmtDateTime(e.event.end)} />
          <Fact k="Duration" v={formatDuration(e.event.durationSeconds, { long: true })} />
          <Fact k="Receiving water" v={e.receivingWater ?? "—"} />
          <Fact k="Parish" v={e.parish ?? "—"} />
        </dl>
      </div>

      {/* rainfall evidence */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">Rainfall evidence</h2>
        <p className="mt-1 text-[12px] text-rh-ink3">
          Daily rainfall at the matched gauge{e.gauge ? ` (${e.gauge.name})` : ""} for the spill day and the days before.
          A spill is <strong>dry</strong> when every day in the window is ≤ {EA_THRESHOLD_MM} mm.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-rh-ink2">
          {e.windows.map((w) => (
            <span key={w.days} className="flex items-center gap-1.5"><span className="text-rh-ink3">{w.days}-day window:</span> {classChip(w.klass)}</span>
          ))}
        </div>
        <table className="mt-3 min-w-full text-[13px]">
          <thead className="text-left text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">
            <tr><th className="py-1 pr-6">Date</th><th className="py-1 pr-6">Rainfall</th><th className="py-1 pr-6"></th></tr>
          </thead>
          <tbody>
            {e.dailyRain.map((d, i) => (
              <tr key={d.date} className="border-t border-rh-rowDiv">
                <td className="py-1 pr-6 font-plexmono text-rh-ink">{fmtDay(d.date)}{i === 0 ? " (spill day)" : ""}</td>
                <td className="py-1 pr-6 font-plexmono text-rh-ink2">{d.mm == null ? <span className="text-rh-ink3">no data</span> : `${d.mm} mm`}</td>
                <td className="py-1 pr-6">{d.mm != null && d.mm > EA_THRESHOLD_MM ? <span className="font-semibold text-rh-wet">rain</span> : d.mm != null ? <span className="font-semibold text-rh-dryDeep">dry</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-rh-ink3">
          River flow that day: {e.flowM3s != null ? `${e.flowM3s} m³/s` : "—"}.
          {e.gauge?.eaStationId && <> Verify at the <a href={`https://check-for-flooding.service.gov.uk/rainfall-station/${e.gauge.eaStationId}`} className="text-rh-teal underline" target="_blank" rel="noopener">EA rainfall station</a>.</>}
        </p>
      </div>

      {/* gauge proximity */}
      {e.gauge && e.asset.lat != null && e.asset.lng != null && (
        <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
          <h2 className="text-[15px] font-bold text-rh-ink">Gauge proximity</h2>
          <p className="mt-1 mb-3 text-[12px] text-rh-ink3">
            Outlet (red) vs matched rain gauge (blue){e.distanceKm != null ? `, ${e.distanceKm.toFixed(1)} km apart` : ""}. Closer means the rainfall reading is more representative of the overflow.
          </p>
          <EvidenceMap
            asset={{ lat: e.asset.lat, lng: e.asset.lng, label: e.asset.name }}
            gauge={e.gauge.lat != null && e.gauge.lng != null ? { lat: e.gauge.lat, lng: e.gauge.lng, label: e.gauge.name } : null}
            distanceKm={e.distanceKm}
          />
        </div>
      )}

      {/* severity & context */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-5">
        <h2 className="mb-3 text-[15px] font-bold text-rh-ink">Severity &amp; context</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact k="Bathing water" v={e.asset.bathingWater ?? "Not a bathing-water overflow"} flag={!!e.asset.bathingWater} />
          <Fact k="Shellfish water" v={e.asset.shellfishWater ?? "Not a shellfish-water overflow"} flag={!!e.asset.shellfishWater} />
          {e.isUpstream && (
            <Fact k="Ahead of the works"
              v={e.aheadOfWorks == null ? "Unknown (no works overflow data)"
                : e.aheadOfWorks ? "Yes — the treatment works' own overflow stayed shut that day, so capacity was available. Avoidable."
                : "No — the works was also overflowing that day."}
              flag={e.aheadOfWorks === true} />
          )}
          {e.annual && (
            <Fact k={`EA annual return (${year})`} v={`${e.annual.spillCount ?? "—"} counted spills · ${e.annual.totalDurationHours != null ? Math.round(e.annual.totalDurationHours) + " h" : "—"} total`} />
          )}
          {e.annual?.reportingPct != null && (
            <Fact k={`Monitor uptime (${year})`} v={`${Math.round(e.annual.reportingPct)}% operational`} flag={e.annual.reportingPct < 90} />
          )}
        </dl>
        {e.tidalCaveat && (
          <p className="mt-3 rounded-[2px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            ⚠ Coastal / tidal location — very short discharges around high tide can be monitor artefacts; corroborate with tide times before relying on short events here.
          </p>
        )}
      </div>

      {/* method */}
      <div className="rounded-[3px] border border-rh-line bg-rh-card px-[22px] py-4 text-[12px] text-rh-ink3">
        <strong className="text-rh-ink2">Method &amp; provenance.</strong> Dry/wet classification is decided by rainfall at the nearest EA gauge — ≤ {EA_THRESHOLD_MM} mm on the spill day and each preceding day of the window (<Link href="/explore/spills/method" className="text-rh-teal underline">how we classify</Link>).
        Spill data: Environment Agency EDM (outlet {e.asset.uniqueId ?? "—"}). Rainfall: EA Hydrology{e.gauge ? ` gauge ${e.gauge.eaStationId ?? e.gauge.name}` : " (no gauge matched)"}.
        A dry spill is precautionary evidence of a likely fault, not proof of an offence — we test the rainfall, not the works&apos; flow. Generated by {INSTANCE.portalName}.
      </div>
    </div>
  );
}

function Fact({ k, v, flag }: { k: string; v: string; flag?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-rh-label">{k}</dt>
      <dd className={`text-[13.5px] ${flag ? "font-semibold text-rh-prestw" : "text-rh-ink"}`}>{v}</dd>
    </div>
  );
}
