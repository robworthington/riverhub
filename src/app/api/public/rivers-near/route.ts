import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

// "Near me" for the national chooser: the covered rivers with an overflow closest to a point.
//
//   GET /api/public/rivers-near?lat=50.43&lng=-3.69
//   GET /api/public/rivers-near?postcode=TQ9%205XX      (full postcode or outcode, e.g. TQ9)
//
// Privacy: a postcode is resolved here, server-side, via postcodes.io (open ONS data), so the visitor's
// browser and IP address never talk to a third party. Coordinates are rounded to 2 decimal places
// (~1 km) before they reach the database. Nothing is stored or logged, and responses are not cached.

const HEADERS = { "Cache-Control": "no-store" };

type Near = {
  slug: string;
  river_name: string;
  district_name: string | null;
  company_name: string | null;
  gaps: number;
  overflows: number;
  distance_km: number;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: HEADERS });
}

/** Full postcode first, then the outward code (e.g. "TQ9"), via postcodes.io. */
async function lookupPostcode(raw: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const pc = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?(\d[A-Z]{2})?$/.test(pc)) return null;
  const tries =
    pc.length > 4
      ? [`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, `https://api.postcodes.io/outcodes/${encodeURIComponent(pc.slice(0, -3))}`]
      : [`https://api.postcodes.io/outcodes/${encodeURIComponent(pc)}`];
  for (const url of tries) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const body = (await res.json()) as { result?: { latitude?: number; longitude?: number; postcode?: string; outcode?: string } };
      const r = body.result;
      if (r && typeof r.latitude === "number" && typeof r.longitude === "number") {
        return { lat: r.latitude, lng: r.longitude, label: r.postcode ?? r.outcode ?? pc };
      }
    } catch {
      /* try the next form */
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  let lat: number;
  let lng: number;
  let label: string | null = null;

  const postcode = sp.get("postcode");
  if (postcode) {
    const hit = await lookupPostcode(postcode);
    if (!hit) return bad("We couldn't find that postcode. Check it, or try just the first half (e.g. TQ9).", 404);
    ({ lat, lng, label } = hit);
  } else {
    lat = Number(sp.get("lat"));
    lng = Number(sp.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("Give a postcode, or lat and lng.");
  }

  // ~1 km precision is plenty to rank rivers, and avoids handling anyone's exact location.
  lat = Math.round(lat * 100) / 100;
  lng = Math.round(lng * 100) / 100;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("rivers_near" as never, { p_lat: lat, p_lng: lng, p_limit: 5 } as never);
  if (error) return bad("Couldn't look up rivers right now. Please try again.", 503);
  const rivers = (data ?? []) as Near[];
  if (rivers.length === 0) return bad("That location is outside the area River Hub covers (Great Britain).", 422);

  return NextResponse.json({ label, rivers }, { headers: HEADERS });
}
