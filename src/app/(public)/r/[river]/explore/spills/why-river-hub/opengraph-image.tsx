import { ImageResponse } from "next/og";
import { resolveRiver } from "@/lib/river";
import { SITE_URL } from "@/lib/site";
import { loadSerif } from "@/lib/og";

export const alt = "Why River Hub — you are paying again to fix this, and nobody has shown you the plan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for the intro / campaign page — leads with its argument instead of the generic tagline.
// Branded with the river's own group (never a fixed group's mark), so it is safe on every river.
export default async function WhyRiverHubOgImage({ params }: { params: Promise<{ river: string }> }) {
  const { river: slug } = await params;
  const [fonts, river] = await Promise.all([loadSerif(700), resolveRiver(slug)]);
  const group = river?.groupName ?? null;
  const kicker = group ? `${group.toUpperCase()} · RIVER HUB` : "RIVER HUB";
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 72px",
          color: "white",
          backgroundImage: "linear-gradient(135deg, #12314B 0%, #1B4468 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "#8FB2CC" }}>
            {kicker}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.08, maxWidth: 1000, fontFamily: fonts ? "Source Serif 4" : "serif" }}>
            You are paying again to fix this. Nobody has shown you the plan.
          </div>
          <div style={{ display: "flex", width: 96, height: 6, backgroundColor: "#A03A2B", marginTop: 26, marginBottom: 26 }} />
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, color: "#D5E3EE", maxWidth: 940 }}>
            Bills up about a third. No public, asset-level plan. Volunteers building the evidence for one — and two
            things you can do about it.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 27, color: "#8FB2CC" }}>{new URL(SITE_URL).hostname}/r/{slug}/explore/spills/why-river-hub</div>
      </div>
    ),
    { ...size, fonts },
  );
}
