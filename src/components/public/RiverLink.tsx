"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useRiverSlug, riverHref } from "./RiverProvider";

/**
 * Drop-in replacement for next/link in the public portal: rewrites portal-internal "/explore/…" hrefs
 * to the current river ("/r/<slug>/explore/…"). Any other href (external, /login, hashes, already
 * /r/…) passes through unchanged, so it is safe to use everywhere in the portal.
 */
export function RiverLink({ href, ...props }: ComponentProps<typeof Link>) {
  const slug = useRiverSlug();
  const h = typeof href === "string" ? riverHref(slug, href) : href;
  return <Link href={h} {...props} />;
}
