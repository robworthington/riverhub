"use client";

import { createContext, useContext } from "react";

/** The current river slug, provided by the public layout so client components (nav, links, maps) can
 *  build river-relative URLs without threading it through props. */
const RiverSlugContext = createContext<string>("dart");

export function RiverProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <RiverSlugContext.Provider value={slug}>{children}</RiverSlugContext.Provider>;
}

export function useRiverSlug(): string {
  return useContext(RiverSlugContext);
}

/** Prefix a portal-internal path ("/explore/…") with the river segment; pass everything else through. */
export function riverHref(slug: string, href: string): string {
  return href === "/explore" || href.startsWith("/explore/") ? `/r/${slug}${href}` : href;
}
