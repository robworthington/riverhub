/**
 * Canonical public-portal URL, used for SEO metadata, sitemap and robots.
 *
 * Defaults to the Vercel production URL so absolute links work today on
 * riverhub.vercel.app. Once the portal's own domain is wired, set
 * NEXT_PUBLIC_SITE_URL=https://data.friendsofthedart.org in the Vercel project.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");
