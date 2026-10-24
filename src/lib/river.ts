/**
 * River resolution (Phase 1 workstream B1, UK-PLATFORM-SPEC).
 *
 * Maps an incoming river slug (from the `/r/<slug>` path, or later a vanity host) to its org id and
 * public branding, via the anon `public_river` RPC (migration 0081). Returns null for an unknown or
 * not-live slug so routes can `notFound()`.
 *
 * This is the national-mode counterpart to the build-time `INSTANCE` branding: the same per-river
 * fields, but resolved at request time from the `organisations` row rather than env vars.
 */
import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";

export type River = {
  orgId: string;
  slug: string;
  orgName: string | null;
  region: string | null;
  live: boolean;
  riverName: string | null;
  portalName: string | null;
  companyName: string | null;
  logoUrl: string | null;
  marketingUrl: string | null;
  donateUrl: string | null;
  mapCentre: [number, number] | null;
  mapZoom: number | null;
};

type PublicRiverRow = {
  id: string;
  slug: string;
  org_name: string | null;
  region: string | null;
  live: boolean;
  river_name: string | null;
  portal_name: string | null;
  company_name: string | null;
  logo_url: string | null;
  marketing_url: string | null;
  donate_url: string | null;
  map_centre_lat: number | null;
  map_centre_lng: number | null;
  map_zoom: number | null;
};

export async function resolveRiver(slug: string): Promise<River | null> {
  const supabase = createPublicClient();
  const rows = await publicRpc<PublicRiverRow>(supabase, "public_river", { p_slug: slug });
  const r = rows[0];
  if (!r) return null;
  return {
    orgId: r.id,
    slug: r.slug,
    orgName: r.org_name,
    region: r.region,
    live: r.live,
    riverName: r.river_name,
    portalName: r.portal_name,
    companyName: r.company_name,
    logoUrl: r.logo_url,
    marketingUrl: r.marketing_url,
    donateUrl: r.donate_url,
    mapCentre:
      r.map_centre_lat != null && r.map_centre_lng != null
        ? [r.map_centre_lat, r.map_centre_lng]
        : null,
    mapZoom: r.map_zoom,
  };
}
