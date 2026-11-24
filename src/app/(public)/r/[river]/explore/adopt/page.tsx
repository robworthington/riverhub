import type { Metadata } from "next";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { createPublicClient } from "@/lib/supabase/public";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { AdoptForm } from "@/components/public/AdoptForm";

// Adopt a river (migration 0107): a local group asks to look after this river on River Hub. Requests
// go to the moderators' queue; approval names the group on every page and invites the contact.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: `Adopt the ${b.riverName} — ${b.portalName}`,
    description: `Ask for your local group to look after the ${b.riverName} on River Hub.`,
  };
}

export default async function AdoptPage() {
  const b = await getBranding();
  const river = await getCurrentRiver();
  const supabase = createPublicClient();
  const { data: pending } = river ? await supabase.rpc("public_adoption_pending" as never, { p_org: river.orgId } as never) : { data: false };
  const adopted = river?.steward === "group";

  return (
    <>
      <PageHeaderBand
        title={`Adopt the ${b.riverName}`}
        intro={
          adopted ? (
            <>{river?.groupName ?? "A local group"} already looks after the {b.riverName} on River Hub.</>
          ) : (
            <>
              River Hub works best when a local group looks after each river. Your group&rsquo;s name goes on every page
              for the {b.riverName}, and your members get the tools to fill the gaps: information requests, photos and
              local knowledge.
            </>
          )
        }
      />
      <PageBody className="space-y-6">
        {adopted || !river ? (
          <p className="max-w-[640px] text-[14.5px] leading-[1.6] text-rh-ink2">
            Want to help? Get in touch with {river?.groupName ?? "the group"} through the link at the top of the
            river&rsquo;s pages, or{" "}
            <RiverLink href="/explore/spills" className="font-semibold text-brand-navy hover:underline">go back to the live board</RiverLink>.
          </p>
        ) : (
          <>
            <section className="grid max-w-[900px] gap-3 sm:grid-cols-3">
              {[
                ["Your name on the river", `Every ${b.riverName} page credits your group, links to your website and shows who to contact.`],
                ["Tools for your members", "Log information requests, add photos and keep the evidence up to date."],
                ["Reviewed by a person", "A River Hub moderator checks each request, usually within a week, and emails you either way."],
              ].map(([h, p]) => (
                <div key={h} className="rounded-[3px] border border-rh-line bg-rh-card px-4 py-3.5">
                  <h2 className="text-[14.5px] font-bold text-rh-ink">{h}</h2>
                  <p className="mt-1 text-[13px] leading-[1.5] text-rh-ink2">{p}</p>
                </div>
              ))}
            </section>
            {pending && (
              <p className="max-w-[640px] rounded-[3px] border border-rh-chipAmberBorder bg-rh-chipAmberBg px-4 py-3 text-[13.5px] text-rh-ink">
                Another request to adopt the {b.riverName} is already being reviewed. You can still send yours: if more
                than one group is interested, a moderator will be in touch.
              </p>
            )}
            <AdoptForm riverSlug={river.slug} riverName={b.riverName} />
          </>
        )}
      </PageBody>
    </>
  );
}
