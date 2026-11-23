import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { overflowLabel } from "@/lib/overflowNames";
import { NIRS_ATTRIBUTION, NIRS_DATASET_URL, SEWAGE_POLLUTANT_LABEL } from "@/lib/nirs";
import { RiverLink } from "@/components/public/RiverLink";

type Incident = {
  not_id: number; occurred_on: string; category: number; pollutants: string[];
  asset_id: string | null; asset_name: string | null; asset_type: string | null; distance_m: number | null;
  lat: number; lng: number;
};
type Summary = { total: number; since_2020: number; category_1: number; latest: string | null; refreshed_at: string | null };

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const CATEGORY = { 1: { label: "Major", cls: "border-[#e8b6ae] bg-rh-alarmTint text-rh-alarmDeep" }, 2: { label: "Significant", cls: "border-rh-chipAmberBorder bg-rh-chipAmberBg text-rh-amber" } } as const;

function pollutantText(p: string[]): string {
  const labels = p.map((x) => SEWAGE_POLLUTANT_LABEL[x] ?? x);
  return labels.length ? labels.join(", ") : "Sewage";
}

function Row({ i, linkAsset }: { i: Incident; linkAsset: boolean }) {
  const cat = CATEGORY[i.category as 1 | 2];
  const near = i.asset_id && i.asset_name
    ? (
      <>
        {i.distance_m != null && i.distance_m <= 30 ? "at " : `about ${i.distance_m} m from `}
        {linkAsset ? (
          <RiverLink href={`/explore/spills/${i.asset_id}`} className="font-semibold text-brand-navy hover:underline">{overflowLabel(i.asset_name, i.asset_type)}</RiverLink>
        ) : (
          overflowLabel(i.asset_name, i.asset_type)
        )}
      </>
    )
    : null;
  return (
    <li className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
      <span className="font-plexmono text-[12.5px] text-rh-ink2">{fmtDate(i.occurred_on)}</span>
      <span className="text-rh-ink">
        <strong>{pollutantText(i.pollutants)}</strong>
        {near && <span className="text-rh-ink2"> · {near}</span>}
      </span>
      {cat && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${cat.cls}`}>{cat.label}</span>}
    </li>
  );
}

function Source({ refreshedAt }: { refreshedAt: string | null }) {
  return (
    <p className="text-[11.5px] leading-[1.5] text-rh-ink3">
      Environment Agency pollution incident records (category 1 and 2, closed incidents), via the{" "}
      <a href={NIRS_DATASET_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">open dataset</a>.{" "}
      {NIRS_ATTRIBUTION} The EA records where an incident happened, not who caused it: &ldquo;near&rdquo; an overflow is
      not a finding that it was responsible. Recent incidents appear only once the EA closes them; minor (category 3)
      incidents aren&rsquo;t published.
      {refreshedAt && <> Checked {new Date(refreshedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.</>}
    </p>
  );
}

// Serious sewage pollution incidents near a river's overflows and works (migration 0100). Renders
// nothing until the EA data has been loaded at least once, so a missing import never reads as
// "no incidents".
//   variant "river": headline counts and the most recent incidents, on the river's live board.
//   variant "asset": incidents within 250 m of one overflow or works, on its page (nothing if none).
export async function PollutionIncidents({ orgId, riverName, assetId, variant = "river" }: { orgId: string; riverName: string; assetId?: string; variant?: "river" | "asset" }) {
  const supabase = createPublicClient();
  const [summaryRows, rows] = await Promise.all([
    publicRpc<Summary>(supabase, "public_pollution_incident_summary", { p_org: orgId }),
    publicRpc<Incident>(supabase, "public_pollution_incidents", assetId ? { p_org: orgId, p_asset: assetId, p_limit: 20 } : { p_org: orgId, p_limit: 50 }),
  ]);
  const s = summaryRows[0];
  if (!s?.refreshed_at) return null; // dataset not loaded yet

  if (variant === "asset") {
    if (!rows.length) return null;
    return (
      <section aria-labelledby="asset-incidents-h" className="space-y-2.5">
        <h2 id="asset-incidents-h" className="text-[16px] font-bold text-rh-ink">Serious pollution incidents recorded here</h2>
        <ol className="divide-y divide-rh-line rounded-[3px] border border-rh-line bg-white">
          {rows.map((i) => <Row key={i.not_id} i={i} linkAsset={false} />)}
        </ol>
        <Source refreshedAt={s.refreshed_at} />
      </section>
    );
  }

  const first = rows.slice(0, 8);
  const rest = rows.slice(8);
  return (
    <section aria-labelledby="incidents-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="incidents-h" className="text-[18px] font-bold text-rh-ink">Serious sewage pollution incidents</h2>
        <span className="text-[12.5px] text-rh-ink3">Near River Hub&rsquo;s overflows and works on the {riverName}</span>
      </div>
      {s.total === 0 ? (
        <p className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-4 py-3 text-[14px] text-rh-ink2">
          The Environment Agency has no closed category 1 or 2 sewage incidents recorded within 1 km of the overflows
          River Hub tracks on the {riverName}. That isn&rsquo;t the same as none happening: minor incidents aren&rsquo;t
          published, and open investigations don&rsquo;t appear yet.
        </p>
      ) : (
        <>
          <p className="text-[14px] text-rh-ink2">
            <strong className="font-plexmono text-rh-ink">{s.total}</strong> since 2000
            {s.since_2020 > 0 && <>, <strong className="font-plexmono text-rh-ink">{s.since_2020}</strong> since 2020</>}
            {s.category_1 > 0 && <>, including <strong className="font-plexmono text-rh-alarmDeep">{s.category_1}</strong> rated major</>}.
          </p>
          <ol className="divide-y divide-rh-line rounded-[3px] border border-rh-line bg-white">
            {first.map((i) => <Row key={i.not_id} i={i} linkAsset />)}
          </ol>
          {rest.length > 0 && (
            <details className="rounded-[3px] border border-rh-line bg-white">
              <summary className="cursor-pointer px-4 py-2.5 text-[13.5px] font-semibold text-brand-navy">
                Show {rest.length} earlier incident{rest.length === 1 ? "" : "s"}
              </summary>
              <ol className="divide-y divide-rh-line border-t border-rh-line">
                {rest.map((i) => <Row key={i.not_id} i={i} linkAsset />)}
              </ol>
            </details>
          )}
          {s.total > rows.length && (
            <p className="text-[12.5px] text-rh-ink3">Showing the {rows.length} most recent of {s.total}.</p>
          )}
        </>
      )}
      <Source refreshedAt={s.refreshed_at} />
    </section>
  );
}
