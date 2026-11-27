import { MODE } from "@/lib/instance";
import { riverSlugForHost } from "@/lib/hostRivers";

/**
 * Where "England" / the River Hub wordmark should point from a river page.
 *
 * On the national host the root serves the summary + chooser, so "/" works, and stays on whichever
 * national domain the visitor is using (riverhub.app, the vercel.app address, a preview). On a river's
 * vanity host (riverhub.friendsofthedart.org) the middleware redirects "/" back into that river, so the
 * link must be absolute: NEXT_PUBLIC_NATIONAL_URL (e.g. https://riverhub.app). With no national URL
 * configured on a vanity host, or in single-river instance mode, there is no national home (null).
 */
export function nationalHomeHref(host: string | null | undefined): string | null {
  if (MODE !== "national") return null;
  if (!riverSlugForHost(host)) return "/";
  const configured = process.env.NEXT_PUBLIC_NATIONAL_URL;
  return configured ? configured.replace(/\/+$/, "") + "/" : null;
}

/** A river basin district page on the national site, relative to the national home link: "/d/<slug>"
 *  on the national host, absolute on a vanity river host. Null when there is no national home. */
export function districtHref(nationalHref: string | null, slug: string | null | undefined): string | null {
  if (!nationalHref || !slug) return null;
  return `${nationalHref.replace(/\/+$/, "")}/d/${encodeURIComponent(slug)}`;
}
