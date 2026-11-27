import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/server";
import { sourceSerif, plexSans, plexMono } from "@/app/fonts";
import { JoinForm } from "./JoinForm";

// A group's public page (migration 0129): who they are, the rivers they work on, and a form to ask to
// join. Kept small on purpose; what else it shows is still to settle (ROLES-AND-GROUPS-SPEC.md).
export const revalidate = 3600;

type Group = { id: string; name: string; slug: string; logo_url: string | null; website_url: string | null; donate_url: string | null };
type River = { organisations: { river_name: string | null; name: string; river_slug: string | null; live: boolean } | null };

async function load(slug: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("groups" as never)
    .select("id, name, slug, logo_url, website_url, donate_url")
    .eq("slug" as never, slug as never)
    .eq("status" as never, "active" as never)
    .maybeSingle();
  const group = data as unknown as Group | null;
  if (!group) return null;
  // Visitors can't read organisations directly (its rules are for members), so the river names come
  // through the server. Only each river's name, slug and live flag leave this function.
  const { data: rivers } = await createAdminClient()
    .from("group_rivers" as never)
    .select("organisations(river_name, name, river_slug, live)")
    .eq("group_id" as never, group.id as never);
  const list = ((rivers as unknown as River[]) ?? [])
    .map((r) => r.organisations)
    .filter((o): o is NonNullable<River["organisations"]> => !!o && o.live && !!o.river_slug);
  return { group, rivers: list };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  return d ? { title: `${d.group.name} — River Hub`, description: `${d.group.name} on River Hub: the rivers they work on, and how to join them.` } : {};
}

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { group, rivers } = d;
  const logo = group.logo_url && /^(https?:\/\/|\/)/.test(group.logo_url) ? group.logo_url : null;

  return (
    <div className={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable} min-h-screen bg-white font-sans text-brand-text`}>
      <header className="bg-brand-navy text-brand-onNavy">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3 text-[14px]">
          <Link href="/" className="font-serif text-[20px] font-bold text-white">River Hub</Link>
          <Link href="/login" className="underline underline-offset-[3px]">Members sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-5 py-10">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" className="h-16 w-16 rounded object-contain" />}
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-brand-label">Group on River Hub</p>
            <h1 className="font-serif text-[32px] font-bold leading-tight text-brand-navyDeep">{group.name}</h1>
          </div>
        </div>

        <section aria-labelledby="rivers-h" className="space-y-2">
          <h2 id="rivers-h" className="text-[18px] font-semibold text-brand-navyDeep">
            {rivers.length === 1 ? "The river they work on" : "Rivers they work on"}
          </h2>
          {rivers.length ? (
            <ul className="flex flex-wrap gap-2">
              {rivers.map((r) => (
                <li key={r.river_slug}>
                  <Link href={`/r/${r.river_slug}/explore/spills`} className="inline-block rounded-full border border-rh-line px-3 py-1 text-[14px] text-rh-teal hover:underline">
                    {r.river_name ?? r.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-rh-ink2">None live yet.</p>}
          {(group.website_url || group.donate_url) && (
            <p className="flex flex-wrap gap-4 pt-1 text-[14px]">
              {group.website_url && <a href={group.website_url} rel="noopener" className="text-rh-teal hover:underline">Their website</a>}
              {group.donate_url && <a href={group.donate_url} rel="noopener" className="text-rh-teal hover:underline">Donate to {group.name}</a>}
            </p>
          )}
        </section>

        <section aria-labelledby="join-h" className="space-y-3 rounded-[10px] border border-rh-line bg-rh-card px-5 py-5">
          <h2 id="join-h" className="text-[18px] font-semibold text-brand-navyDeep">Ask to join {group.name}</h2>
          <p className="text-[14px] text-rh-ink2">
            Volunteers take water samples, enter results, chase information requests and photograph the river. Tell the group a
            little about yourself and they&rsquo;ll reply by email.
          </p>
          <JoinForm slug={group.slug} groupName={group.name} />
        </section>
      </main>
    </div>
  );
}
