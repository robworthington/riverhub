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

  // National site: the home page, every covered river basin district, and each live river's main pages
  // (~8 per river, so ~2,700 URLs at 340 rivers, well under the 50,000 a sitemap may hold).
  if (process.env.NEXT_PUBLIC_MODE === "national") {
    try {
      const supabase = createPublicClient();
      const [{ data: rivers }, { data: districts }] = await Promise.all([
        supabase.rpc("national_rivers" as never),
        supabase.rpc("national_districts" as never),
      ]);
      const riverPages = ((rivers as unknown as { slug: string }[]) ?? []).flatMap((r) => [
        entry(`/r/${r.slug}/explore/spills`, "hourly", 0.9),
        entry(`/r/${r.slug}/explore/spills/map`, "daily", 0.6),
        entry(`/r/${r.slug}/explore/spills/incidents`, "weekly", 0.5),
        entry(`/r/${r.slug}/explore/spills/emergency-overflows`, "monthly", 0.4),
        entry(`/r/${r.slug}/explore/spills/why`, "weekly", 0.6),
        entry(`/r/${r.slug}/explore/spills/why/capacity`, "monthly", 0.5),
        entry(`/r/${r.slug}/explore/spills/measures`, "weekly", 0.6),
        entry(`/r/${r.slug}/explore/spills/gaps`, "weekly", 0.6),
      ]);
      const districtPages = ((districts as unknown as { slug: string; rivers: number }[]) ?? [])
        .filter((d) => d.rivers > 0)
        .map((d) => entry(`/d/${d.slug}`, "daily", 0.7));
      return [entry("/", "hourly", 1), ...districtPages, ...riverPages];
    } catch {
      return [entry("/", "hourly", 1)];
    }
  }

  const staticPages: MetadataRoute.Sitemap = [
    entry("/explore/spills", "weekly", 1),
    entry("/explore/spills/map", "weekly", 0.7),
    entry("/explore/spills/why", "weekly", 0.7),
    entry("/explore/spills/method", "monthly", 0.5),
    entry("/explore/councils", "weekly", 0.7),
  ];

  try {
    const supabase = createPublicClient();
    const [{ data: parishes }, { data: districts }] = await Promise.all([
      supabase.rpc("public_parishes"),
      supabase.rpc("public_districts"),
    ]);

    const parishPages = (parishes ?? []).map((p) => entry(`/explore/councils/parish/${p.id}`, "monthly", 0.5));
    const districtPages = (districts ?? []).map((d) =>
      entry(`/explore/councils/district/${encodeURIComponent(d.district)}`, "monthly", 0.6),
    );

    return [...staticPages, ...districtPages, ...parishPages];
  } catch {
    // If the data layer is unreachable at build time, still publish the static pages.
    return staticPages;
  }
}
