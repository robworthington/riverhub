import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { ClassBadge, VolunteerCaveat, fmtDay } from "@/components/public/VolunteerTesting";

// Volunteer testing on the river (migration 0132): sites and approved results from groups that have
// chosen to publish them. Cached for an hour.
export const revalidate = 3600;

type Site = {
  id: string; name: string; lat: number | null; lng: number | null; approximate: boolean; tidal: boolean;
  group_name: string; group_slug: string; samples: number; first_sampled: string | null; last_sampled: string | null;
  klass: string | null; methods: string[];
};

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Volunteer testing — ${b.portalName}`,
    description: `Water-quality samples taken by local groups on the ${b.riverName}: sites, results and bathing-water classes.`,
  };
}

export default async function VolunteerTestingPage() {
  const b = await getBranding();
  const river = await getCurrentRiver();
  const { data } = river
    ? await createPublicClient().rpc("public_volunteer_sites" as never, { p_org: river.orgId } as never)
    : { data: [] };
  const sites = (data as unknown as Site[] | null) ?? [];
  const groups = [...new Map(sites.map((s) => [s.group_slug, { name: s.group_name, slug: s.group_slug }])).values()];

  return (
    <>
      <PageHeaderBand
        title="Volunteer testing"
        intro={<>Local groups test the {b.riverName} for bacteria where people swim and paddle. These are the sites and results they publish.</>}
      />
      <PageBody className="space-y-6">
        {!sites.length ? (
          <p className="max-w-[760px] rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5 text-[14px] leading-[1.6] text-rh-ink2">
            No group publishes its testing on the {b.riverName} yet. Groups choose whether to share their results; the
            Environment Agency&rsquo;s own tests are on <RiverLink href="/explore/health" className="text-rh-teal hover:underline">River health</RiverLink>.
          </p>
        ) : (
          <>
            <p className="text-[14px] text-rh-ink2">
              {sites.length} {sites.length === 1 ? "site" : "sites"} tested by{" "}
              {groups.map((g, i) => (
                <span key={g.slug}>{i > 0 && (i === groups.length - 1 ? " and " : ", ")}<a href={`/g/${g.slug}`} className="font-semibold text-brand-navy hover:underline">{g.name}</a></span>
              ))}.
            </p>
            <div className="overflow-x-auto rounded-[10px] border border-rh-line bg-rh-card">
              <table className="min-w-full text-[14px]">
                <thead className="text-left text-[12px] uppercase tracking-[.08em] text-rh-label">
                  <tr>
                    <th className="px-4 py-2.5">Site</th>
                    <th className="px-4 py-2.5">Class</th>
                    <th className="px-4 py-2.5 text-right">Samples</th>
                    <th className="px-4 py-2.5">Tested</th>
                    <th className="px-4 py-2.5">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rh-line">
                  {sites.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5">
                        <RiverLink href={`/explore/health/volunteer/${s.id}`} className="font-medium text-rh-teal hover:underline">{s.name}</RiverLink>
                        <div className="text-[12px] text-rh-ink3">{s.tidal ? "Coastal or estuary" : "Freshwater"}</div>
                      </td>
                      <td className="px-4 py-2.5"><ClassBadge klass={s.klass} /></td>
                      <td className="px-4 py-2.5 text-right font-plexmono">{s.samples.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-[13px] text-rh-ink2">{fmtDay(s.first_sampled)} to {fmtDay(s.last_sampled)}</td>
                      <td className="px-4 py-2.5 text-[13px]"><a href={`/g/${s.group_slug}`} className="text-rh-ink2 hover:underline">{s.group_name}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <VolunteerCaveat />
          </>
        )}
      </PageBody>
    </>
  );
}
