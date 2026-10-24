/**
 * Request-scoped river resolution (Phase 1 workstreams B2/C).
 *
 * The middleware sets the `x-river-slug` header from the `/r/<slug>` path (or, later, a vanity host).
 * Server components read the resolved river from here — without threading it through every page — so
 * branding and RPC org-scoping come from the current river rather than the build-time INSTANCE const.
 *
 * `getBranding()` merges the river's `organisations` row over the INSTANCE defaults, so anything not
 * yet set on the row (or instance-mode deployments) still render correctly.
 */
import { headers } from "next/headers";
import { cache } from "react";
import { resolveRiver, type River } from "@/lib/river";
import { INSTANCE } from "@/lib/instance";

export const RIVER_SLUG_HEADER = "x-river-slug";

/** The river slug used in instance mode and for legacy/root redirects (the single deployed river). */
export const DEFAULT_RIVER_SLUG = process.env.NEXT_PUBLIC_DEFAULT_RIVER ?? "dart";

/** Resolve the current request's river from the x-river-slug header. Cached per request. */
export const getCurrentRiver = cache(async (): Promise<River | null> => {
  const slug = (await headers()).get(RIVER_SLUG_HEADER);
  if (!slug) return null;
  return resolveRiver(slug);
});

export type Branding = {
  orgName: string;
  logoUrl: string;
  portalName: string;
  riverName: string;
  companyName: string;
  marketingUrl: string;
  donateUrl: string;
  mapCentre: [number, number];
  mapZoom: number;
  slug: string;
};

/** Branding for the current river, falling back to INSTANCE defaults field-by-field. */
export async function getBranding(): Promise<Branding> {
  const r = await getCurrentRiver();
  return {
    orgName: r?.orgName ?? INSTANCE.orgName,
    logoUrl: r?.logoUrl ?? INSTANCE.logoUrl,
    portalName: r?.portalName ?? INSTANCE.portalName,
    riverName: r?.riverName ?? INSTANCE.riverName,
    companyName: r?.companyName ?? INSTANCE.companyName,
    marketingUrl: r?.marketingUrl ?? INSTANCE.marketingUrl,
    donateUrl: r?.donateUrl ?? INSTANCE.donateUrl,
    mapCentre: r?.mapCentre ?? INSTANCE.mapCentre,
    mapZoom: r?.mapZoom ?? INSTANCE.mapZoom,
    slug: r?.slug ?? DEFAULT_RIVER_SLUG,
  };
}

/** Prefix an in-portal path with the current river segment, e.g. "/explore/spills" -> "/r/dart/explore/spills". */
export function riverPath(slug: string, path: string): string {
  return `/r/${slug}${path.startsWith("/") ? path : `/${path}`}`;
}
