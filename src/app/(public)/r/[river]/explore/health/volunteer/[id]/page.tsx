import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { ClassBadge, VolunteerCaveat, fmtDay } from "@/components/public/VolunteerTesting";

// One volunteer sampling site and its approved results (migration 0132). Only for groups that publish;
// never shows who collected a sample, notes or access details.
export const revalidate = 3600;

type Result = { date: string; test: string; unit: string | null; result: number | null; qualifier: string | null; condition: string | null; weather: string | null };
type Site = {
  id: string; name: string; tidal: boolean; type: string | null; description: string | null;
  lat: number | null; lng: number | null; approximate: boolean; org_id: string; river_slug: string;
  group: { name: string; slug: string; website_url: string | null }; klass: string | null; results: Result[];
};

async function load(id: string): Promise<Site | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const river = await getCurrentRiver();
  const { data } = await createPublicClient().rpc("public_volunteer_site" as never, { p_site: id } as never);
  const s = data as unknown as Site | null;
  return s && river && s.org_id === river.orgId ? s : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [b, s] = await Promise.all([getBranding(), load(id)]);
  return {
    title: `${s ? s.name : "Volunteer site"} — ${b.portalName}`,
    description: s ? `Water-quality samples taken by ${s.group.name} at ${s.name} on the ${b.riverName}.` : undefined,
  };
}

export default async function VolunteerSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await load(id);
  if (!s) notFound();
  const b = await getBranding();
  const dates = s.results.map((r) => r.date).sort();

  return (
    <>
      <PageHeaderBand
        label="Volunteer sampling site"
        title={s.name}
        intro={<>Tested by <a href={`/g/${s.group.slug}`} className="font-semibold hover:underline">{s.group.name}</a> on the {b.riverName}{dates.length ? `, ${fmtDay(dates[0])} to ${fmtDay(dates[dates.length - 1])}` : ""}.</>}
      />
      <PageBody className="space-y-6">
        <RiverLink href="/explore/health/volunteer" className="text-[14px] text-rh-teal hover:underline">← All volunteer sites</RiverLink>
        <div className="flex flex-wrap gap-x-10 gap-y-3 rounded-[10px] border border-rh-line bg-rh-card px-5 py-4 text-[14px]">
          <div><div className="text-[12px] uppercase tracking-[.08em] text-rh-label">Bathing-water class</div><ClassBadge klass={s.klass} /></div>
          <div><div className="text-[12px] uppercase tracking-[.08em] text-rh-label">Approved results</div><span className="font-plexmono">{s.results.length.toLocaleString()}</span></div>
          <div><div className="text-[12px] uppercase tracking-[.08em] text-rh-label">Water</div>{s.tidal ? "Coastal or estuary" : "Freshwater"}</div>
          {s.lat != null && s.lng != null && (
            <div>
              <div className="text-[12px] uppercase tracking-[.08em] text-rh-label">Location{s.approximate ? " (approximate)" : ""}</div>
              <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=15/${s.lat}/${s.lng}`} rel="noopener" className="font-plexmono text-rh-teal hover:underline">
                {s.lat.toFixed(s.approximate ? 3 : 5)}, {s.lng.toFixed(s.approximate ? 3 : 5)}
              </a>
            </div>
          )}
        </div>
        {s.description && <p className="max-w-[760px] text-[14px] leading-[1.6] text-rh-ink2">{s.description}</p>}

        <section aria-labelledby="res-h" className="space-y-2">
          <h2 id="res-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">Results</h2>
          {!s.results.length ? <p className="text-[14px] text-rh-ink2">No approved results yet.</p> : (
            <div className="overflow-x-auto rounded-[10px] border border-rh-line bg-rh-card">
              <table className="min-w-full text-[14px]">
                <thead className="text-left text-[12px] uppercase tracking-[.08em] text-rh-label">
                  <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Test</th><th className="px-4 py-2 text-right">Result</th><th className="px-4 py-2">Conditions</th></tr>
                </thead>
                <tbody className="divide-y divide-rh-line">
                  {s.results.map((r, i) => (
                    <tr key={`${r.date}-${r.test}-${i}`}>
                      <td className="whitespace-nowrap px-4 py-2">{fmtDay(r.date)}</td>
                      <td className="px-4 py-2 text-rh-ink2">{r.test}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-plexmono">
                        {r.result == null ? "—" : `${r.qualifier && r.qualifier !== "=" ? r.qualifier : ""}${r.result.toLocaleString()}`}
                        {r.result != null && r.unit ? <span className="text-rh-ink3"> {r.unit}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-[13px] text-rh-ink3">{[r.condition, r.weather].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <VolunteerCaveat group={s.group} />
      </PageBody>
    </>
  );
}
