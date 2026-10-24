import { ImageResponse } from "next/og";
import { INSTANCE } from "@/lib/instance";
import { SITE_URL } from "@/lib/site";
import { FOD_MARK_DATA_URI } from "@/lib/og-assets";
import { loadSerif } from "@/lib/og";

export const alt = `${INSTANCE.portalName} — open water-quality & sewage data from ${INSTANCE.orgName}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card for every public-portal page (design_handoff_riverhub_header palette).
export default async function OpengraphImage() {
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
        {/* brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FOD_MARK_DATA_URI} width={84} height={84} alt="" />
          <div style={{ display: "flex", fontSize: 27, fontWeight: 700, letterSpacing: 4, color: "#8FB2CC" }}>
            {INSTANCE.orgName.toUpperCase()}
          </div>
        </div>

        {/* wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 700, lineHeight: 1, fontFamily: fonts ? "Source Serif 4" : "serif" }}>
            River Hub
          </div>
          <div style={{ display: "flex", width: 96, height: 6, backgroundColor: "#A03A2B", marginTop: 26, marginBottom: 26 }} />
          <div style={{ display: "flex", fontSize: 37, lineHeight: 1.3, color: "#D5E3EE", maxWidth: 940 }}>
            Open water-quality &amp; sewage data for the {INSTANCE.riverName} catchment — pollution map,
            bathing-water classifications and storm-overflow spills.
          </div>
        </div>

        {/* domain */}
        <div style={{ display: "flex", fontSize: 27, color: "#8FB2CC" }}>{new URL(SITE_URL).hostname}</div>
      </div>
    ),
    { ...size, fonts },
  );
}
