import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The members app and the public portal share one deployment. Allow crawlers into the portal
// (root + /explore) and keep the login-gated members routes out of search indexes.
const MEMBERS_PREFIXES = [
  "/admin",
  "/analysis",
  "/assets",
  "/councils",
  "/dashboard",
  "/dry-spills",
  "/environment",
  "/heatmap",
  "/map",
  "/profile",
  "/rainfall-stations",
  "/results",
  "/sewage-systems",
  "/sites",
  "/test-types",
  "/login",
  "/accept-invite",
  "/api",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore"],
        disallow: MEMBERS_PREFIXES.map((p) => `${p}/`),
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
