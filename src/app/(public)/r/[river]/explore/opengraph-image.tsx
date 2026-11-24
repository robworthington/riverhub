import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { resolveRiver } from "@/lib/river";
import { SITE_URL } from "@/lib/site";
import { loadCardFonts, loadCardPhoto, cardTime, liveAgeHours, SAFETY_LINE } from "@/lib/og";
import { ShareCard } from "@/components/og/ShareCard";
import { primeRiverSlug } from "@/lib/river-context";
import { riverLive } from "@/lib/riverLive";
import type { NationalRiver } from "@/lib/national-data";

export const alt = "River Hub: sewage overflows spilling into this river right now";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 600;

/** "River Dart" from "Dart" or "River Dart" (some rows carry the prefix already). */
function riverTitle(name: string): string {
  // no prefix for names that already say what they are, or that join two rivers ("Lower Tamar & Inny")
  return /^river\b/i.test(name) || /\b(estuary|brook|water|stream)\b/i.test(name) || /&|^(upper|lower)\b/i.test(name)
    ? name
    : `River ${name}`;
}

// "River right now" share card (canvas card 1), for every page under /r/<river>/explore that doesn't
// set its own. Live figures come from the live board's own cached data (riverLive); branding is
// River Hub plus the river's own group, never another group's mark. When the feeds are more than a day
// behind it shows the river's record instead of a stale live count.
export default async function RiverOgImage({ params }: { params: Promise<{ river: string }> }) {
  const { river: slug } = await params;
  primeRiverSlug(slug);
  const [fonts, river, rivers, now] = await Promise.all([
    loadCardFonts(),
    resolveRiver(slug),
    publicRpc<NationalRiver>(createPublicClient(), "national_rivers"),
    riverLive().catch(() => null),
  ]);
  const row = rivers.find((r) => r.slug === slug);
  // the river's lead photo, when its group has published one (plain card otherwise)
  const photo = await loadCardPhoto(river?.orgId);
  const name = riverTitle(river?.riverName ?? row?.river_name ?? slug);
  const short = name.replace(/^River\s+/i, "");
  const host = new URL(SITE_URL).hostname;
  // Credit the local group only when one has claimed the river (steward, migration 0101).
  const group = river?.groupName ?? null;
  const company = river?.companyName ?? row?.company_name;
  const asOf = now?.asOf ?? null;
  const age = liveAgeHours(asOf);
  const live = now && now.total > 0 && age != null && age <= 24;

  const card = live ? (
    <ShareCard
      hasFonts={!!fonts}
      photo={photo}
      liveDot={age! <= 3}
      kicker={`${age! > 3 ? "Last update" : "Live"} · ${name}`}
      accent="#B8342A"
      numberColor="#A02A20"
      number={now.spilling.toLocaleString("en-GB")}
      numberSuffix={`of ${now.total.toLocaleString("en-GB")}`}
      sentence={`sewage overflows spilling into the ${short}`}
      footer={`${cardTime(asOf)} · ${company ? `${company}'s own monitors` : "water company monitors"} · ${host}/r/${slug}`}
      footer2={group ? `${SAFETY_LINE} With ${group}.` : SAFETY_LINE}
    />
  ) : (
    <ShareCard
      hasFonts={!!fonts}
      photo={photo}
      kicker={name}
      accent="#1B4468"
      numberColor="#12314B"
      number={(row?.overflows ?? 0).toLocaleString("en-GB")}
      sentence={`sewage overflows on the ${short}: their spills, and who is fixing them`}
      footer={`${company ? `${company} monitors` : "Water company monitors"} · ${host}/r/${slug}`}
      footer2={group ? `With ${group}` : undefined}
    />
  );
  return new ImageResponse(card, { ...size, fonts });
}
