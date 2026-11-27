import { cachedRpc } from "@/lib/publicData";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { publicPhotoUrl } from "@/lib/photos";

// The group that looks after the river, at the top of its spills page (Nov 2026): logo, name, the
// group's own news line, links to its site, join page and donations, and a few of its photos.
// Renders nothing on a river no group looks after (the side rail invites a group to adopt it).

type Group = { name: string; slug: string; website_url: string | null; logo_url: string | null; donate_url: string | null; news: string | null; news_updated_at: string | null };
type Photo = { id: string; caption: string; public_path: string; thumb_public_path: string };

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export async function GroupStrip({ orgId, riverName }: { orgId: string; riverName: string }) {
  let groups: Group[] = [];
  try {
    groups = await cachedRpc<Group>("public_river_groups", { p_org: orgId });
  } catch {
    return null;
  }
  if (!groups.length) return null;
  const [g, ...others] = groups;
  const photos = (await publicRpc<Photo>(createPublicClient(), "public_river_photos", { p_org: orgId })).slice(0, 3);
  const logo = g.logo_url && /^(https?:\/\/|\/)/.test(g.logo_url) ? g.logo_url : null;
  const initials = g.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("").slice(0, 3) || g.name.slice(0, 2);
  const linkCls = "font-semibold text-brand-navy hover:underline";

  return (
    <section aria-label={`${g.name} looks after the ${riverName}`} className="flex flex-col gap-4 rounded-[6px] border border-rh-line bg-rh-card px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-[6px] object-contain" />
        ) : (
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-rh-cardAlt font-serif text-[17px] font-bold text-brand-navyDeep">{initials}</span>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-brand-label">Looked after by</p>
          <p className="font-serif text-[20px] font-bold leading-tight text-brand-navyDeep">
            <a href={`/g/${g.slug}`} className="hover:underline">{g.name}</a>
            {others.length > 0 && (
              <span className="text-[14px] font-normal text-rh-ink2">
                {" "}with {others.map((o, i) => (
                  <span key={o.slug}>{i > 0 && (i === others.length - 1 ? " and " : ", ")}<a href={`/g/${o.slug}`} className="hover:underline">{o.name}</a></span>
                ))}
              </span>
            )}
          </p>
          {g.news && (
            <p className="text-[14px] leading-[1.5] text-rh-ink">
              {g.news}
              {g.news_updated_at && <span className="text-[12px] text-rh-ink3"> · {fmtDay(g.news_updated_at)}</span>}
            </p>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
            {g.website_url && <a href={g.website_url} rel="noopener" className={linkCls}>Website ↗</a>}
            <a href={`/g/${g.slug}`} className={linkCls}>Join us</a>
            {g.donate_url && <a href={g.donate_url} rel="noopener" className={linkCls}>Donate to {g.name} ↗</a>}
          </p>
        </div>
      </div>
      {photos.length > 0 && (
        <ul className="flex shrink-0 gap-2">
          {photos.map((p) => (
            <li key={p.id}>
              <a href={publicPhotoUrl(p.public_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="block h-[72px] w-[96px] overflow-hidden rounded-[4px] bg-brand-band">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicPhotoUrl(p.thumb_public_path) ?? undefined} alt={p.caption} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
