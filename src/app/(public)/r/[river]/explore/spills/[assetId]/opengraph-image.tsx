import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { primeRiverSlug } from "@/lib/river-context";
import { resolveRiver } from "@/lib/river";
import { overflowLabel } from "@/lib/overflowNames";
import { SITE_URL } from "@/lib/site";
import { loadCardFonts, loadCardPhoto } from "@/lib/og";
import { ShareCard } from "@/components/og/ShareCard";

export const alt = "River Hub: this sewage overflow's spill record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

type Header = { asset_name: string; asset_type: string | null; dry_all: number; total_all: number; first_year: number | null };

// "An overflow's record" share card (canvas card 2): named, located, one telling number. Leads with
// dry-weather spills since 2020 when there are any, else total spills on record.
export default async function OverflowOgImage({ params }: { params: Promise<{ river: string; assetId: string }> }) {
  const { river: slug, assetId } = await params;
  primeRiverSlug(slug);
  const [fonts, river, rows] = await Promise.all([
    loadCardFonts(),
    resolveRiver(slug),
    publicRpc<Header>(createPublicClient(), "public_spill_asset", { p_asset: assetId }),
  ]);
  const a = rows[0];
  // this overflow's own photo, else the river's lead photo (plain card when there's none)
  const photo = await loadCardPhoto(river?.orgId, assetId);
  const riverName = river?.riverName ? (/^river\b/i.test(river.riverName) ? river.riverName : `River ${river.riverName}`) : "River Hub";
  const host = new URL(SITE_URL).hostname;
  const name = a ? overflowLabel(a.asset_name, a.asset_type) : "Sewage overflow";
  const dry = (a?.dry_all ?? 0) > 0;
  const n = a ? (dry ? a.dry_all : a.total_all) : 0;
  const card = (
    <ShareCard
      hasFonts={!!fonts}
      photo={photo}
      kicker={`Overflow · ${riverName}`}
      accent="#6B4A8F"
      numberColor="#55337C"
      eyebrow={name.length > (photo ? 34 : 46) ? `${name.slice(0, photo ? 33 : 45)}…` : name}
      number={n.toLocaleString("en-GB")}
      sentence={dry ? "spills in dry weather since 2020" : `spills on record${a?.first_year ? ` since ${a.first_year}` : ""}`}
      footer={dry ? "No meaningful rain that day or the day before" : "Counted from the overflow's own monitor"}
      footer2={`Water company monitors · ${host}`}
    />
  );
  return new ImageResponse(card, { ...size, fonts });
}
