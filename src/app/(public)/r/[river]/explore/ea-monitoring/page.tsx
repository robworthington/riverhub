import { RiverLink } from "@/components/public/RiverLink";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentRiver, getBranding } from "@/lib/river-context";
import { regulatorFor } from "@/lib/nation";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  return {
    title: `${reg.short} water-quality monitoring — ${b.portalName}`,
    description: `${reg.name} per-sample water-quality monitoring across the ${b.riverName} catchment — every ${reg.short} sampling point with its full determinand history (nutrients, dissolved oxygen, ammonia, nitrate and more).`,
  };
}

type Site = {
  notation: string; site_label: string | null; latitude: number | null; longitude: number | null;
  wb_name: string | null; determinands: string[]; n_samples: number; latest_sample: string | null;
};

export default async function EaMonitoringPage() {
  const supabase = createPublicClient();
  const b = await getBranding();
  const reg = regulatorFor(b.nation);
  const org = (await getCurrentRiver())?.orgId;
  const { data } = await supabase.rpc("public_ea_wq_sites", { p_org: org });
  const sites = ((data ?? []) as Site[]).slice().sort((a, b) => (a.site_label ?? a.notation).localeCompare(b.site_label ?? b.notation));
  const totalSamples = sites.reduce((n, s) => n + (s.n_samples ?? 0), 0);

  return (
    <>
      {/* the standard band (Nov 2026): it carries the River health tabs, which the old teal hero hid */}
      <PageHeaderBand
        title="Every sampling point"
        intro={
          <>
            {reg.TheName}&rsquo;s own laboratory tests across the {b.riverName} catchment: every sampling point with
            its full history of nutrients, dissolved oxygen, ammonia, nitrate, BOD and more. Open a point to chart any test
            over time.
          </>
        }
      />
      <PageBody className="space-y-5">
      {sites.length === 0 ? (
        <p className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] text-rh-ink2">
          {reg.TheName}&rsquo;s test results haven&rsquo;t been loaded for the {b.riverName} yet.
        </p>
      ) : (
        <>
          <p className="font-plexmono text-[12px] text-rh-ink3">
            {sites.length} sampling points · {totalSamples.toLocaleString()} samples
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-rh-line bg-rh-card">
            <table className="min-w-full text-[14px]">
              <thead className="text-left text-[12px] uppercase tracking-[.08em] text-rh-label">
                <tr>
                  <th className="px-4 py-2.5">Sampling point</th>
                  <th className="px-4 py-2.5">Water body</th>
                  <th className="px-4 py-2.5 text-right">Tests</th>
                  <th className="px-4 py-2.5 text-right">Samples</th>
                  <th className="px-4 py-2.5">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rh-line">
                {sites.map((s) => (
                  <tr key={s.notation} className="hover:bg-rh-rowHover">
                    <td className="px-4 py-2.5">
                      <RiverLink href={`/explore/ea-monitoring/${encodeURIComponent(s.notation)}`} className="font-medium text-rh-teal hover:underline">
                        {s.site_label ?? s.notation}
                      </RiverLink>
                    </td>
                    <td className="px-4 py-2.5 text-rh-ink2">{s.wb_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-plexmono text-rh-ink2">{s.determinands?.length ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-plexmono text-rh-ink2">{(s.n_samples ?? 0).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-rh-ink2">{s.latest_sample ? s.latest_sample.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-rh-ink3">
            Source: {reg.wqSource} (per-sample observations), Open Government Licence.
          </p>
        </>
      )}
      </PageBody>
    </>
  );
}
