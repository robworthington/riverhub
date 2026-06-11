import { ImageResponse } from "next/og";
import { INSTANCE } from "@/lib/instance";
import { SITE_URL } from "@/lib/site";

export const alt = `${INSTANCE.portalName} — open water-quality & sewage data from ${INSTANCE.orgName}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card for every public-portal page.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "white",
          backgroundImage: "linear-gradient(135deg, #176577 0%, #1d7c8c 60%, #2a9fb3 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, opacity: 0.9, letterSpacing: 1 }}>
          {INSTANCE.orgName.toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.05 }}>{INSTANCE.portalName}</div>
          <div style={{ fontSize: 38, marginTop: 24, opacity: 0.92, maxWidth: 900 }}>
            Open water-quality &amp; sewage data for the catchment — pollution map, bathing-water
            classifications and storm-overflow spills.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>
          {new URL(SITE_URL).hostname}
        </div>
      </div>
    ),
    size,
  );
}
