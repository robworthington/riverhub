/**
 * Canonical public-portal URL, used for SEO metadata, sitemap and robots.
 *
 * Resolution order: NEXT_PUBLIC_SITE_URL → Vercel production URL → localhost. Each candidate is
 * validated as a real http(s) origin; a malformed value (e.g. a forgotten placeholder) is ignored
 * rather than crashing the build via `new URL(...)`. Once the portal's own domain is wired, set
 * NEXT_PUBLIC_SITE_URL=https://data.friendsofthedart.org in the Vercel project.
 */
function normaliseOrigin(raw?: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    // Reject obviously-bogus hosts (e.g. an un-substituted "NEXT_PUBLIC_SITE_URL").
    if (url.hostname !== "localhost" && !url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const SITE_URL =
  normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
  normaliseOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  "http://localhost:3000";
