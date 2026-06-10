import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entry = (
    path: string,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly",
    priority = 0.6,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  const staticPages: MetadataRoute.Sitemap = [
    entry("/explore", "weekly", 1),
    entry("/explore/map", "weekly", 0.9),
    entry("/explore/sites", "weekly", 0.8),
    entry("/explore/spills", "weekly", 0.8),
    entry("/explore/councils", "weekly", 0.7),
  ];

  try {
    const supabase = createPublicClient();
    const [{ data: sites }, { data: parishes }, { data: districts }] = await Promise.all([
      supabase.rpc("public_sites"),
      supabase.rpc("public_parishes"),
      supabase.rpc("public_districts"),
    ]);

    const sitePages = (sites ?? []).map((s) => entry(`/explore/sites/${s.id}`, "weekly", 0.5));
    const parishPages = (parishes ?? []).map((p) => entry(`/explore/councils/parish/${p.id}`, "monthly", 0.5));
    const districtPages = (districts ?? []).map((d) =>
      entry(`/explore/councils/district/${encodeURIComponent(d.district)}`, "monthly", 0.6),
    );

    return [...staticPages, ...sitePages, ...districtPages, ...parishPages];
  } catch {
    // If the data layer is unreachable at build time, still publish the static pages.
    return staticPages;
  }
}
