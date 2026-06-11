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
  /** Public portal title ("<river> Data" works well). */
  portalName: process.env.NEXT_PUBLIC_PORTAL_NAME ?? "River Dart Data",
  /** River / catchment name used in prose ("the <riverName> catchment"). */
  riverName: process.env.NEXT_PUBLIC_RIVER_NAME ?? "River Dart",
  /** The group's marketing site (portal links back to it). */
  marketingUrl: process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.friendsofthedart.org",
  /** Default map centre/zoom before data loads (maps fit to data thereafter). "lat,lng". */
  mapCentre: parseCentre(process.env.NEXT_PUBLIC_MAP_CENTRE, [50.45, -3.72]),
  mapZoom: Number(process.env.NEXT_PUBLIC_MAP_ZOOM ?? 11),
} as const;

/** Bare hostname of the marketing site, for link labels ("friendsofthedart.org ↗"). */
export const MARKETING_HOST = (() => {
  try {
    return new URL(INSTANCE.marketingUrl).hostname.replace(/^www\./, "");
  } catch {
    return INSTANCE.marketingUrl;
  }
})();
