import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assetTypeLabel, WeatherBadge } from "@/components/edm-ui";
import { EvidenceMap } from "@/components/EvidenceMap";
import { PrintButton } from "@/components/PrintButton";
import { EA_THRESHOLD_MM, METHODOLOGY_URL, type ConfidenceLevel } from "@/lib/dryspill";
import { formatDuration } from "@/lib/duration";
import { INSTANCE } from "@/lib/instance";
import { WinepPanel, type WinepActionRow } from "@/components/WinepPanel";
import { getSpillEvidence } from "@/lib/spill-evidence";

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "full" });

export default async function SpillDossierPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  await requireProfile();
  const { id, eventId } = await params;
  const supabase = await createClient();

  const e = await getSpillEvidence(supabase, eventId, id);
  if (!e) notFound();

  const { data: winep } = await supabase.rpc("public_winep_for_asset", { p_asset_id: id });
  const winepActions = (winep as WinepActionRow[]) ?? [];

  const confCls: Record<ConfidenceLevel, string> = {
    High: "bg-red-100 text-red-800",
    Medium: "bg-amber-100 text-amber-800",
    Low: "bg-gray-100 text-gray-600",
  };
  const year = e.event.start.slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2 no-print">
        <Link href={`/assets/${id}`} className="text-sm text-river-700 hover:underline">← {e.asset.name}</Link>
        <div className="flex gap-2">
          <a href={`/api/export/spill-evidence?event=${eventId}`} className="btn-secondary text-sm">Download evidence (JSON)</a>
          <PrintButton />
        </div>
      </div>

      <div className="card print-plain space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-400">{INSTANCE.orgName} — spill evidence dossier</p>
        <h1 className="text-xl font-semibold">{e.asset.name}</h1>
        <p className="text-sm text-gray-600">
          {assetTypeLabel(e.asset.type as never)}{e.asset.uniqueId ? ` · ${e.asset.uniqueId}` : ""}
          {e.system ? ` · ${e.system}` : ""}
        </p>
        <div className="pt-1"><WeatherBadge weatherClass={e.primaryClass} /></div>
      </div>

      {e.primaryClass === "dry" && (
        <div className="card print-plain">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Evidence strength</h2>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${confCls[e.confidence.level]}`}>
              {e.confidence.level} confidence
            </span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ul className="space-y-1 text-sm text-gray-700">{e.confidence.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
            {e.confidence.caveats.length > 0 && (
              <ul className="space-y-1 text-sm text-amber-700">{e.confidence.caveats.map((c) => <li key={c}>⚠ {c}</li>)}</ul>
            )}
          </div>
        </div>
      )}

      <div className="card print-plain">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">The discharge</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact k="Spill day" v={fmtDate(e.event.start)} />
          <Fact k="Started" v={fmtDateTime(e.event.start)} />
          <Fact k="Ended" v={e.event.ongoing ? "ongoing" : fmtDateTime(e.event.end)} />
          <Fact k="Duration" v={formatDuration(e.event.durationSeconds, { long: true })} />
          <Fact k="Receiving water" v={e.receivingWater ?? "—"} />
          <Fact k="Parish" v={e.parish ?? "—"} />
        </dl>
      </div>

      <div className="card print-plain">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Rainfall evidence</h2>
        <p className="mb-3 text-xs text-gray-400">
          Daily rainfall at the matched gauge{e.gauge ? ` (${e.gauge.name})` : ""} for the spill day and the preceding days.
          A spill is <strong>dry</strong> when every day in the window is ≤ {EA_THRESHOLD_MM} mm.
        </p>
        <div className="flex flex-wrap gap-4">
          {e.windows.map((w) => (
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
            {e.dailyRain.map((d, i) => (
              <tr key={d.date} className="border-t border-gray-100">
                <td className="py-1 pr-6">{new Date(d.date).toLocaleDateString("en-GB")}{i === 0 ? " (spill day)" : ""}</td>
                <td className="py-1 pr-6">{d.mm == null ? <span className="text-gray-400">no data</span> : `${d.mm} mm`}</td>
                <td className="py-1 pr-6">{d.mm != null && d.mm > EA_THRESHOLD_MM ? <span className="text-green-700">rain</span> : d.mm != null ? <span className="text-red-700">dry</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">
          River flow that day: {e.flowM3s != null ? `${e.flowM3s} m³/s` : "—"}.
          {e.gauge?.eaStationId && <> Verify at the <a href={`https://check-for-flooding.service.gov.uk/rainfall-station/${e.gauge.eaStationId}`} className="text-river-700 underline" target="_blank" rel="noopener">EA rainfall station</a>.</>}
        </p>
      </div>

      {e.gauge && e.asset.lat != null && e.asset.lng != null && (
        <div className="card print-plain">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Gauge proximity</h2>
          <p className="mb-3 text-xs text-gray-400">
            Outlet (red) vs matched rain gauge (blue){e.distanceKm != null ? `, ${e.distanceKm.toFixed(1)} km apart` : ""}. Closer = more representative.
          </p>
          <EvidenceMap
            asset={{ lat: e.asset.lat, lng: e.asset.lng, label: e.asset.name }}
            gauge={e.gauge.lat != null && e.gauge.lng != null ? { lat: e.gauge.lat, lng: e.gauge.lng, label: e.gauge.name } : null}
            distanceKm={e.distanceKm}
          />
        </div>
      )}

      <div className="card print-plain">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Severity &amp; context</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact k="Bathing water" v={e.asset.bathingWater ?? "Not a bathing-water overflow"} flag={!!e.asset.bathingWater} />
          <Fact k="Shellfish water" v={e.asset.shellfishWater ?? "Not a shellfish-water overflow"} flag={!!e.asset.shellfishWater} />
          {e.isUpstream && (
            <Fact k="Ahead of the works"
              v={e.aheadOfWorks == null ? "Unknown (no works overflow data)"
                : e.aheadOfWorks ? "Yes — the treatment works' own overflow was shut that day (capacity was available; avoidable)"
                : "No — the works was also overflowing that day"}
              flag={e.aheadOfWorks === true} />
          )}
          {e.annual && (
            <Fact k={`EA annual return (${year})`}
              v={`${e.annual.spillCount ?? "—"} counted spills · ${e.annual.totalDurationHours != null ? Math.round(e.annual.totalDurationHours) + " h" : "—"} total`} />
          )}
          {e.annual?.reportingPct != null && (
            <Fact k={`Monitor uptime (${year})`} v={`${Math.round(e.annual.reportingPct)}% operational`} flag={e.annual.reportingPct < 90} />
          )}
        </dl>
        {e.tidalCaveat && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ Coastal / tidal location — very short discharges around high tide can be monitor artefacts;
            corroborate with tide times (planned layer) before relying on short events here.
          </p>
        )}
        <p className="mt-3 text-xs text-gray-400">
          The EA 12/24-hour count is the regulator&rsquo;s headline; this dossier is the per-event,
          precautionary view (duration, antecedent-dry window, receptor proximity, avoidability).
        </p>
      </div>

      {winepActions.length > 0 && (
        <WinepPanel
          actions={winepActions}
          heading="Planned improvements committed for this asset (WINEP)"
          emptyText=""
        />
      )}

      <div className="card print-plain text-xs text-gray-500">
        <p>
          <strong>Method &amp; provenance.</strong> Dry/wet classification per{" "}
          <a href={METHODOLOGY_URL} className="text-river-700 underline">DRY-SPILL-METHOD.md</a> ({e.methodVersion}):
          ≤ {EA_THRESHOLD_MM} mm on the spill day and each preceding day of the window.
          Spill data: Environment Agency EDM (outlet {e.asset.uniqueId ?? "—"}). Rainfall: EA Hydrology
          {e.gauge ? ` gauge ${e.gauge.eaStationId ?? e.gauge.name}` : " (no gauge matched)"}. A dry spill is{" "}
          <em>presumptively non-compliant</em> (UWWTR 1994 Reg 4(4)), not proof of an offence — we test the
          rainfall limb, not pass-forward flow. Generated {new Date(e.generatedAt).toLocaleString("en-GB")} by {INSTANCE.portalName}.
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
