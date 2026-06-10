import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types";

// /api routes do their own auth (e.g. the cron route checks a bearer secret).
// /explore is the public portal — open to anyone (also reachable directly on the primary host
// until the public subdomain's DNS is wired).
const PUBLIC_PATHS = ["/login", "/accept-invite", "/auth", "/api", "/explore"];

// The public portal lives on its own subdomain (e.g. data.friendsofthedart.org). Requests to that
// host only ever serve /explore; the members app stays on the primary host.
function isPublicHost(host: string): boolean {
  return host.startsWith("data.");
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Hostname routing: on the public subdomain, scope everything to the portal — no auth gate.
  const host = request.headers.get("host") ?? "";
  if (isPublicHost(host)) {
    const p = request.nextUrl.pathname;
    if (p === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/explore";
      return NextResponse.rewrite(url);
    }
    if (!p.startsWith("/explore") && !p.startsWith("/api") && !p.startsWith("/_next")) {
      const url = request.nextUrl.clone();
      url.pathname = "/explore";
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

  const path = request.nextUrl.pathname;
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
