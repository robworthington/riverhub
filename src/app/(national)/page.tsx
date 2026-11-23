import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import Link from "next/link";
import { RiverChooser, type ChooserRiver } from "@/components/national/RiverChooser";
import type { NationalDistrict } from "@/lib/national-data";

// Cached for 10 min (ISR) — national rollups are heavy; a traffic spike is served from cache.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "River Hub — England's rivers, in the open",
  description:
    "Open sewage and water-quality data for rivers across England, maintained by local volunteer groups. The gaps in the public record, river by river.",
};

type Summary = {
  rivers: number; overflows: number; gaps: number; dry: number; hours_lfy: number;
  baseline_spills: number; latest_spills: number;
};
type RiverRow = ChooserRiver & { dry: number; hours_lfy: number };

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-[6px] border border-brand-line2 bg-white px-5 py-4">
      <div className={`font-plexmono text-[32px] font-bold leading-none ${accent ? "text-rh-alarm" : "text-brand-navyDeep"}`}>{value}</div>
      <div className="mt-1.5 text-[13px] text-brand-body">{label}</div>
    </div>
  );
}

export default async function NationalHomePage() {
  const supabase = createPublicClient();
  const [sumRows, rivers, districts] = await Promise.all([
    publicRpc<Summary>(supabase, "national_summary"),
    publicRpc<RiverRow>(supabase, "national_rivers"),
    publicRpc<NationalDistrict>(supabase, "national_districts"),
  ]);
  const s = sumRows[0] ?? null;

  const reductionPct =
    s && s.baseline_spills > 0 ? Math.round(((s.baseline_spills - s.latest_spills) / s.baseline_spills) * 100) : null;
  const league = rivers.filter((r) => r.gaps > 0).slice(0, 10);

  return (
    <div className="space-y-10">
      {/* Block 1 — headline */}
      <section className="space-y-5">
        <div className="max-w-[60ch] space-y-3">
          <h1 className="font-serif text-[34px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-navyDeep sm:text-[44px]">
            England&rsquo;s rivers, in the open
          </h1>
          <p className="text-[17px] leading-[1.6] text-brand-body">
            River Hub brings together open sewage and water-quality data for rivers across England,
            maintained by local volunteer groups — and shows the gaps in the public record, river by river.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={(s?.rivers ?? rivers.length).toLocaleString()} label="rivers covered" />
          <Stat value={(s?.overflows ?? 0).toLocaleString()} label="overflows tracked" />
          <Stat value={(s?.gaps ?? 0).toLocaleString()} label="gaps — flagged, no measure on record" accent />
          <Stat value={(s?.dry ?? 0).toLocaleString()} label="dry-weather spills since 2020" />
        </div>
      </section>

      {/* Block 4 — chooser (placed high: the primary action is to pick a river) */}
      <section className="space-y-4">
        <div className="max-w-[60ch] space-y-1.5">
          <h2 className="font-serif text-[24px] font-bold text-brand-navyDeep">Choose a river</h2>
          <p className="text-[14px] leading-[1.55] text-brand-body">
            Pick a catchment to see live spill status, the gaps, treatment-works capacity and what the
            regulator requires. Your river not here?{" "}
            <a href="mailto:hello@riverhub.org?subject=River%20Hub%20—%20cover%20my%20river" className="text-brand-navy hover:underline">Register interest →</a>
          </p>
        </div>
        <RiverChooser rivers={rivers} />
      </section>

      {/* River basin districts — the regional lens (each links to its /d/<slug> page) */}
      {districts.length > 0 && (
        <section className="space-y-4">
          <div className="max-w-[60ch] space-y-1.5">
            <h2 className="font-serif text-[24px] font-bold text-brand-navyDeep">England&rsquo;s river basin districts</h2>
            <p className="text-[14px] leading-[1.55] text-brand-body">
              The Environment Agency plans and reports river health by river basin district. Open a district
              to compare the rivers River Hub covers there.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {districts.map((d) =>
              d.rivers > 0 ? (
                <li key={d.slug}>
                  <Link
                    href={`/d/${d.slug}`}
                    className="flex h-full flex-col gap-1.5 rounded-[6px] border border-brand-line2 bg-white px-5 py-4 transition-colors hover:border-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                  >
                    <span className="font-serif text-[18px] font-bold text-brand-navyDeep">{d.name}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-brand-body">
                      <span><strong className="font-plexmono text-brand-navyDeep">{d.rivers}</strong> {d.rivers === 1 ? "river" : "rivers"}</span>
                      <span><strong className="font-plexmono text-rh-alarm">{d.gaps}</strong> gaps</span>
                    </span>
                    {d.companies.length > 0 && <span className="text-[12px] text-brand-label">{d.companies.join(" · ")}</span>}
                  </Link>
                </li>
              ) : (
                <li key={d.slug} className="flex flex-col gap-1 rounded-[6px] border border-dashed border-brand-dashed px-5 py-4">
                  <span className="font-serif text-[17px] font-bold text-brand-label">{d.name}</span>
                  <span className="text-[12.5px] text-brand-placeholder">Not yet covered</span>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {/* Block 2 — worst-offender league */}
      {league.length > 0 && (
        <section className="space-y-4">
          <div className="max-w-[60ch] space-y-1.5">
            <h2 className="font-serif text-[24px] font-bold text-brand-navyDeep">Where the gaps are widest</h2>
            <p className="text-[14px] leading-[1.55] text-brand-body">
              Rivers ranked by the number of overflows with a flagged problem and no measure recorded against them.
            </p>
          </div>
          <div className="overflow-hidden rounded-[6px] border border-brand-line2">
            <table className="w-full text-[14px]">
              <thead className="bg-brand-band text-left text-[12px] uppercase tracking-[.08em] text-brand-label">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">River</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Gaps</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Overflows</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Dry spills</th>
                </tr>
              </thead>
              <tbody>
                {league.map((r) => (
                  <tr key={r.slug} className="border-t border-brand-line">
                    <td className="px-4 py-2.5">
                      <a href={`/r/${r.slug}/explore/spills/gaps`} className="font-semibold text-brand-navy hover:underline">{r.river_name}</a>
                    </td>
                    <td className="px-4 py-2.5 text-right font-plexmono font-bold text-rh-alarm">{r.gaps}</td>
                    <td className="px-4 py-2.5 text-right font-plexmono text-brand-body">{r.overflows}</td>
                    <td className="px-4 py-2.5 text-right font-plexmono text-brand-body">{r.dry.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Block 3 — reduction vs baseline */}
      {reductionPct != null && (
        <section className="rounded-[6px] border border-brand-line2 bg-brand-band px-6 py-6">
          <h2 className="font-serif text-[22px] font-bold text-brand-navyDeep">Progress against the 2020 baseline</h2>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-plexmono text-[40px] font-bold leading-none text-brand-navyDeep">
              {reductionPct > 0 ? "−" : "+"}{Math.abs(reductionPct)}%
            </span>
            <span className="text-[14px] text-brand-body">
              counted spills across covered rivers, latest full year vs the 2020 SODRP baseline
              ({s!.baseline_spills.toLocaleString()} → {s!.latest_spills.toLocaleString()})
            </span>
          </div>
          <p className="mt-2 max-w-[70ch] text-[12.5px] text-brand-placeholder">
            Counted on the Environment Agency 12/24-hour basis. Figures reflect only the rivers currently
            covered by River Hub, and grow as more groups join.
          </p>
        </section>
      )}
    </div>
  );
}
