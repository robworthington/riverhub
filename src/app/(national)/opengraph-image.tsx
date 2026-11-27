import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { SITE_URL } from "@/lib/site";
import { loadCardFonts, cardTime, liveAgeHours, SAFETY_LINE } from "@/lib/og";
import { ShareCard } from "@/components/og/ShareCard";
import { nationalCoverage, type NationalHome } from "@/lib/national-data";
import { riversOf } from "@/lib/nation";

export const alt = "River Hub: sewage overflows spilling into rivers right now";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// The rollup behind this refreshes hourly; regenerate the card on the home page's 10-minute cadence.
export const revalidate = 600;

// "England right now" share card (canvas card 6). "Rivers we cover" stays in the sentence until
// coverage is national. Falls back to the record when the feeds are more than a day behind.
export default async function NationalOgImage() {
  const [fonts, rows, coverage] = await Promise.all([
    loadCardFonts(), publicRpc<NationalHome>(createPublicClient(), "national_home"), nationalCoverage(),
  ]);
  const h = rows[0];
  const host = new URL(SITE_URL).hostname;
  const age = liveAgeHours(h?.live_as_of);
  const live = h && h.monitors > 0 && age != null && age <= 24;
  const card = live ? (
    <ShareCard
      dark
      hasFonts={!!fonts}
      liveDot={age! <= 3}
      kicker={age! > 3 ? `Last update · ${coverage}` : `Live · ${coverage}`}
      accent="#F2B3AA"
      numberColor="#FF8A7A"
      number={h.spilling_now.toLocaleString("en-GB")}
      sentence={`overflows spilling into ${h.rivers_spilling} of the ${h.rivers} rivers we cover`}
      footer={`${cardTime(h.live_as_of)} · water company monitors · ${host}`}
      footer2={SAFETY_LINE}
    />
  ) : (
    <ShareCard
      dark
      hasFonts={!!fonts}
      kicker={coverage}
      accent="#F2B3AA"
      numberColor="#FF8A7A"
      number={(h?.dry ?? 0).toLocaleString("en-GB")}
      sentence={`dry-weather sewage spills since 2020, across the ${h?.rivers ?? 0} rivers we cover`}
      footer={`Water company monitors · ${host}`}
    />
  );
  return new ImageResponse(card, { ...size, fonts });
}
