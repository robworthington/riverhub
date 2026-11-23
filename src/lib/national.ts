import { MODE } from "@/lib/instance";
import { riverSlugForHost } from "@/lib/hostRivers";

/**
 * Where "England" / the River Hub wordmark should point from a river page.
 *
 * On the national host the root serves the summary + chooser, so "/" works. On a river's vanity host
 * (riverhub.friendsofthedart.org) the middleware redirects "/" back into that river, so the link must
 * be absolute: NEXT_PUBLIC_NATIONAL_URL (e.g. https://riverhub.org). With no national URL configured
 * on a vanity host, or in single-river instance mode, there is no national home to link to (null).
 */
export function nationalHomeHref(host: string | null | undefined): string | null {
  if (MODE !== "national") return null;
  const configured = process.env.NEXT_PUBLIC_NATIONAL_URL;
  if (configured) return configured.replace(/\/+$/, "") + "/";
  return riverSlugForHost(host) ? null : "/";
}
