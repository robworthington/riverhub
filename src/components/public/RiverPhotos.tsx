import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { LICENCE_LABEL, LICENCE_URL, publicPhotoUrl, type PhotoLicence } from "@/lib/photos";
import { RiverLink } from "@/components/public/RiverLink";

type PublicPhoto = {
  id: string; asset_id: string | null; caption: string; place: string | null; taken_on: string | null;
  credit: string; licence: PhotoLicence; public_path: string; thumb_public_path: string;
  width: number | null; height: number | null; is_hero: boolean;
};

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null);

function Credit({ p }: { p: PublicPhoto }) {
  const url = LICENCE_URL[p.licence];
  return (
    <span className="text-[11.5px] leading-[1.45] text-brand-label">
      Photo: {p.credit} ·{" "}
      {url ? <a href={url} target="_blank" rel="noopener noreferrer license" className="hover:underline">{LICENCE_LABEL[p.licence]}</a> : LICENCE_LABEL[p.licence]}
      {" · "}
      <RiverLink href={`/explore/photos/report/${p.id}`} className="hover:underline" rel="nofollow">Report</RiverLink>
    </span>
  );
}

// Approved photos from the river's group (migration 0099). Renders nothing when there are none: a river
// without a group shows no photo rather than a stock one.
//   variant "river": the lead photo large, then up to six more, on the river's live board.
//   variant "asset": photos of one overflow or works, on its page.
export async function RiverPhotos({ orgId, riverName, assetId, variant = "river" }: { orgId: string; riverName: string; assetId?: string; variant?: "river" | "asset" }) {
  const rows = await publicRpc<PublicPhoto>(createPublicClient(), "public_river_photos", assetId ? { p_org: orgId, p_asset: assetId } : { p_org: orgId });
  if (!rows.length) return null;

  if (variant === "asset") {
    return (
      <section aria-labelledby="asset-photos-h" className="space-y-2.5">
        <h2 id="asset-photos-h" className="text-[16px] font-bold text-rh-ink">Photos</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.slice(0, 8).map((p) => (
            <li key={p.id}>
              <figure className="space-y-1">
                <a href={publicPhotoUrl(p.public_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-[4px] bg-brand-band">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicPhotoUrl(p.thumb_public_path) ?? undefined} alt={p.caption} loading="lazy" className="h-full w-full object-cover" />
                </a>
                <figcaption className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] leading-[1.4] text-rh-ink2">{p.caption}{p.taken_on ? `, ${fmt(p.taken_on)}` : ""}</span>
                  <Credit p={p} />
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const [lead, ...rest] = rows;
  const more = rest.slice(0, 6);
  return (
    <section aria-labelledby="river-photos-h" className="space-y-3">
      <h2 id="river-photos-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">The {riverName}</h2>
      <div className={`grid gap-4 ${more.length ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
        <figure className="space-y-1.5">
          <a href={publicPhotoUrl(lead.public_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="block aspect-[16/10] overflow-hidden rounded-[6px] bg-brand-band">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicPhotoUrl(lead.public_path) ?? undefined} alt={lead.caption} loading="lazy" className="h-full w-full object-cover" />
          </a>
          <figcaption className="flex flex-col gap-0.5">
            <span className="text-[14px] text-brand-text">
              {lead.caption}
              {[lead.place, fmt(lead.taken_on)].filter(Boolean).length > 0 && <span className="text-brand-body"> · {[lead.place, fmt(lead.taken_on)].filter(Boolean).join(", ")}</span>}
            </span>
            <Credit p={lead} />
          </figcaption>
        </figure>
        {more.length > 0 && (
          <ul className="grid grid-cols-2 content-start gap-3">
            {more.map((p) => (
              <li key={p.id}>
                <figure className="space-y-1">
                  <a href={publicPhotoUrl(p.public_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-[4px] bg-brand-band">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicPhotoUrl(p.thumb_public_path) ?? undefined} alt={p.caption} loading="lazy" className="h-full w-full object-cover" />
                  </a>
                  <figcaption className="flex flex-col gap-0.5">
                    <span className="line-clamp-2 text-[12.5px] leading-[1.4] text-brand-text">{p.caption}</span>
                    <Credit p={p} />
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
