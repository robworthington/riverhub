import { ImageResponse } from "next/og";
import { INSTANCE } from "@/lib/instance";
import { SITE_URL } from "@/lib/site";
import { FOD_MARK_DATA_URI } from "@/lib/og-assets";
import { loadSerif } from "@/lib/og";

export const alt = "Why River Hub — you are paying again to fix this, and nobody has shown you the plan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for the intro / campaign page — leads with its argument instead of the generic tagline.
export default async function WhyRiverHubOgImage() {
  const fonts = await loadSerif(700);
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FOD_MARK_DATA_URI} width={84} height={84} alt="" />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "#8FB2CC" }}>
            {INSTANCE.orgName.toUpperCase()} · RIVER HUB
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

        <div style={{ display: "flex", fontSize: 27, color: "#8FB2CC" }}>{new URL(SITE_URL).hostname}/explore/spills/why-river-hub</div>
      </div>
    ),
    { ...size, fonts },
  );
}
