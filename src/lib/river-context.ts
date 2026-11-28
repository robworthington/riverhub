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
import type { Nation } from "@/lib/nation";
import { headers } from "next/headers";
import { cache } from "react";
import { resolveRiver, type River } from "@/lib/river";
import { INSTANCE } from "@/lib/instance";

export const RIVER_SLUG_HEADER = "x-river-slug";

/** The river slug used in instance mode and for legacy/root redirects (the single deployed river). */
export const DEFAULT_RIVER_SLUG = process.env.NEXT_PUBLIC_DEFAULT_RIVER ?? "dart";

// Request-scoped river slug, primed by the /r/<slug> layout from the route param. React cache() returns
// one object per request, so a slug stored here by the layout is visible to every nested server
// component and data call in that request. The route param is the reliable source: unlike the
// middleware-set x-river-slug request header (dropped across Vercel's edge-middleware → node-function
// boundary, which 404s every /r/<slug> page), the param is always present on the node render. The
// layout primes this SYNCHRONOUSLY, before returning its children, so there is no render-order race.
const riverSlugRef = cache((): { slug: string | null } => ({ slug: null }));

/** Called synchronously by the /r/<slug> layout with the route param, before any nested component
 *  renders. Everything in the request then resolves to this river. */
export function primeRiverSlug(slug: string | null | undefined): void {
  if (slug) riverSlugRef().slug = slug;
}

/** The current request's river: the slug primed by the layout, else the x-river-slug header (fallback
 *  for non-/r contexts such as /api, or environments where the header survives). NOT wrapped in
 *  cache() so an early header-miss is never memoised over a later prime — resolveRiver is cached per
 *  slug, so repeat calls stay cheap. */
export async function getCurrentRiver(): Promise<River | null> {
  let slug = riverSlugRef().slug;
  if (!slug) slug = (await headers()).get(RIVER_SLUG_HEADER);
  if (!slug) return null;
  return resolveRiver(slug);
}

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
  capacityResponse: boolean;
  /** The local group that looks after the river, or null when River Hub does (steward, migration 0101).
   *  Instance deployments (no resolved river) keep their build-time org. Use this, not orgName, wherever
   *  the page credits "the group": orgName on an unclaimed river is a placeholder like "River Camel". */
  groupName: string | null;
  /** "england" or "wales" (migration 0135): which regulator and programme the pages name (lib/nation) */
  nation: Nation;
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
    capacityResponse: r?.capacityResponse ?? INSTANCE.capacityResponse,
    groupName: r ? r.groupName : INSTANCE.orgName,
    nation: r?.nation ?? "england",
  };
}

/** Prefix an in-portal path with the current river segment, e.g. "/explore/spills" -> "/r/dart/explore/spills". */
export function riverPath(slug: string, path: string): string {
  return `/r/${slug}${path.startsWith("/") ? path : `/${path}`}`;
}
