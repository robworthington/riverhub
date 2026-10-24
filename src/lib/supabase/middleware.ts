import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types";

// /api routes do their own auth (e.g. the cron route checks a bearer secret).
// /r/<river> is the public portal (national multi-river routing); /explore is the legacy portal path
// (now redirected into /r/<default>). Both are open to anyone.
const PUBLIC_PATHS = ["/login", "/accept-invite", "/auth", "/api", "/explore", "/r"];

// The river shown in instance mode and for legacy/root redirects (the single deployed river).
const DEFAULT_RIVER = process.env.NEXT_PUBLIC_DEFAULT_RIVER ?? "dart";
const RIVER_SLUG_HEADER = "x-river-slug";
// national = the multi-river site (root serves the national summary + chooser); instance = a single
// river (root redirects to it).
const MODE = process.env.NEXT_PUBLIC_MODE === "national" ? "national" : "instance";

// The public portal lives on its own subdomain (e.g. data.friendsofthedart.org). Requests to that
// host only ever serve the portal; the members app stays on the primary host.
function isPublicHost(host: string): boolean {
  return host.startsWith("data.");
}

/** A pass-through response that carries the river slug to server components, overwriting any
 *  client-supplied value (the path segment is the only trusted source). */
function withRiverSlug(request: NextRequest, slug: string) {
  const headers = new Headers(request.headers);
  headers.set(RIVER_SLUG_HEADER, slug);
  return NextResponse.next({ request: { headers } });
}

/** The river slug from a /r/<slug>/... path, or null. */
function riverSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/r\/([^/]+)(?:\/|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // --- Public portal routing (host-agnostic): /r/<river> is canonical; / and /explore redirect in ---
  const slug = riverSlugFromPath(path);
  if (slug) {
    // Public portal page — no auth gate; hand the trusted slug to server components.
    return withRiverSlug(request, slug);
  }
  if (path === "/") {
    if (MODE === "instance") {
      const url = request.nextUrl.clone();
      url.pathname = `/r/${DEFAULT_RIVER}/explore/spills`;
      return NextResponse.redirect(url);
    }
    // national: the root serves the summary + chooser (public, no auth gate).
    return NextResponse.next({ request });
  }
  if (path === "/explore" || path.startsWith("/explore/")) {
    // Legacy portal URLs -> the default river (keeps old links working until the national chooser).
    const url = request.nextUrl.clone();
    url.pathname = `/r/${DEFAULT_RIVER}${path}`;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  // Hostname routing: on the public subdomain, scope everything to the portal — no auth gate.
  const host = request.headers.get("host") ?? "";
  if (isPublicHost(host)) {
    const portalOk =
      path.startsWith("/r/") ||
      path.startsWith("/api") ||
      path.startsWith("/_next") ||
      path === "/robots.txt" ||
      path === "/sitemap.xml";
    if (!portalOk) {
      const url = request.nextUrl.clone();
      url.pathname = `/r/${DEFAULT_RIVER}/explore/spills`;
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
