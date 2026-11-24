import type { Metadata } from "next";
import { getBranding, getCurrentRiver } from "@/lib/river-context";
import { createPublicClient } from "@/lib/supabase/public";
import { publicPhotoUrl } from "@/lib/photos";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";
import { RiverLink } from "@/components/public/RiverLink";
import { PhotoReportForm } from "@/components/public/PhotoReportForm";

// Report a river photo (migration 0110). Linked from "Report" under each public photo.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report a photo — River Hub", robots: { index: false } };

type Reportable = { id: string; organisation_id: string; caption: string; credit: string; thumb_public_path: string | null };

export default async function ReportPhotoPage({ params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const b = await getBranding();
  const river = await getCurrentRiver();
  const supabase = createPublicClient();
  const ok = /^[0-9a-f-]{36}$/i.test(photoId);
  const { data } = ok
    ? await supabase.rpc("public_reportable_photo" as never, { p_photo: photoId } as never)
    : { data: [] };
  const photo = ((data as unknown as Reportable[]) ?? []).find((p) => !river || p.organisation_id === river.orgId) ?? null;
  const thumb = publicPhotoUrl(photo?.thumb_public_path);

  return (
    <>
      <PageHeaderBand title="Report a photo" intro={<>Tell the {b.riverName}&rsquo;s admins what&rsquo;s wrong with a photo on River Hub.</>} />
      <PageBody className="space-y-5">
        {!photo ? (
          <p className="max-w-[560px] text-[14.5px] text-rh-ink2">
            That photo isn&rsquo;t on River Hub any more.{" "}
            <RiverLink href="/explore/spills" className="font-semibold text-brand-navy hover:underline">Back to the live board</RiverLink>
          </p>
        ) : (
          <>
            <figure className="flex max-w-[560px] items-center gap-4 rounded-[3px] border border-rh-line bg-rh-card p-3">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-20 w-28 shrink-0 rounded-[2px] object-cover" />
              )}
              <figcaption className="text-[13.5px] text-rh-ink">
                <strong>{photo.caption}</strong>
                <span className="block text-rh-ink3">Photo: {photo.credit}</span>
              </figcaption>
            </figure>
            <PhotoReportForm photoId={photo.id} riverName={b.riverName} />
          </>
        )}
      </PageBody>
    </>
  );
}
