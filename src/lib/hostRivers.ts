/**
 * Host → river-slug mapping (Phase 1 cutover pre-req).
 *
 * A river's vanity domain (e.g. riverhub.friendsofthedart.org) should land on that river rather than
 * the national default. The map is configured per deployment via NEXT_PUBLIC_HOST_RIVERS, a JSON
 * object of { "<host>": "<river_slug>" } — so adding a vanity domain is a config change, not code:
 *
 *   NEXT_PUBLIC_HOST_RIVERS={"riverhub.friendsofthedart.org":"dart","<teign-host>":"teign"}
 *
 * The middleware uses this only to choose which river the bare host and legacy /explore paths redirect
 * into; everything then stays /r/<slug>-rooted (so links and nav are unchanged).
 */

function parseMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [host, slug] of Object.entries(obj)) {
      if (typeof slug === "string" && slug) out[normaliseHost(host)] = slug;
    }
    return out;
  } catch {
    return {};
  }
}

/** Lowercase, drop any port, and strip a leading www. so matching is forgiving. */
function normaliseHost(host: string): string {
  return host.toLowerCase().split(":")[0].replace(/^www\./, "");
}

const HOST_RIVERS = parseMap(process.env.NEXT_PUBLIC_HOST_RIVERS);

/** The river slug configured for this host, or null if the host is not a vanity river domain. */
export function riverSlugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return HOST_RIVERS[normaliseHost(host)] ?? null;
}
