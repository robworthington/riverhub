/**
 * Instance configuration (federation workstream F2).
 *
 * Everything that distinguishes one group's River Hub from another's lives here, driven by
 * NEXT_PUBLIC_* env vars set per deployment. Defaults are the Friends of the Dart values so the
 * original instance needs no env changes; new instances override via Vercel project env.
 *
 * NOTE: NEXT_PUBLIC_* vars are inlined at build time — each must be referenced as a literal
 * `process.env.NEXT_PUBLIC_X` expression (no dynamic lookup).
 */

function parseCentre(raw: string | undefined, fallback: [number, number]): [number, number] {
  if (!raw) return fallback;
  const [lat, lng] = raw.split(",").map((s) => Number(s.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : fallback;
}

export const INSTANCE = {
  /** The group running this instance (shown in headers, footers, emails). */
  orgName: process.env.NEXT_PUBLIC_ORG_NAME ?? "Friends of the Dart",
  /** Square group mark shown in the public header (path or URL). Set per instance via
   *  NEXT_PUBLIC_LOGO_URL (e.g. "/fort-mark.png" for the Teign); defaults to the Friends of the Dart mark. */
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL ?? "/fod-mark.png",
  /** Public portal title ("<river> Data" works well). */
  portalName: process.env.NEXT_PUBLIC_PORTAL_NAME ?? "River Dart Data",
  /** River / catchment name used in prose ("the <riverName> catchment"). */
  riverName: process.env.NEXT_PUBLIC_RIVER_NAME ?? "River Dart",
  /** Water/sewerage company responsible for the catchment (WINEP, spills prose). */
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "South West Water",
  /** The group's marketing site (portal links back to it). */
  marketingUrl: process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.friendsofthedart.org",
  /** PayPal hosted-button donate link (same button as the main FoD site). */
  donateUrl: process.env.NEXT_PUBLIC_DONATE_URL ?? "https://www.paypal.com/donate/?hosted_button_id=SQ6XYEF4CS37S",
  /** Default map centre/zoom before data loads (maps fit to data thereafter). "lat,lng". */
  mapCentre: parseCentre(process.env.NEXT_PUBLIC_MAP_CENTRE, [50.45, -3.72]),
  mapZoom: Number(process.env.NEXT_PUBLIC_MAP_ZOOM ?? 11),
  /** True once the water company has given an initial information-request response with capacity
   *  figures (flow to full treatment / population), so the capacity page can say so. Off by default;
   *  the Dart sets NEXT_PUBLIC_CAPACITY_RESPONSE=1 (SWW EIR26291). */
  capacityResponse:
    process.env.NEXT_PUBLIC_CAPACITY_RESPONSE === "1" ||
    process.env.NEXT_PUBLIC_CAPACITY_RESPONSE === "true",
  /**
   * Cookie-free Umami analytics on the public portal (no consent banner needed). Off unless a
   * website ID is set. The Friends of the Dart IDs apply only when no NEXT_PUBLIC_ORG_NAME is set,
   * so other instances never report into the Dart's stats. `domains` limits counting to the live
   * host: previews and local runs send nothing.
   */
  umami: {
    src: process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://stats.friendsofthedart.org/script.js",
    websiteId:
      process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ??
      (process.env.NEXT_PUBLIC_ORG_NAME ? "" : "5f4fff3b-108b-46f4-a220-834c9b260a1b"),
    domains:
      process.env.NEXT_PUBLIC_UMAMI_DOMAINS ??
      (process.env.NEXT_PUBLIC_ORG_NAME ? "" : "riverhub.friendsofthedart.org"),
  },
} as const;

/** Bare hostname of the marketing site, for link labels ("friendsofthedart.org ↗"). */
export const MARKETING_HOST = (() => {
  try {
    return new URL(INSTANCE.marketingUrl).hostname.replace(/^www\./, "");
  } catch {
    return INSTANCE.marketingUrl;
  }
})();
