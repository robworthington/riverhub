import { type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveRiver } from "@/lib/river";
import type { WqSample } from "@/lib/riverHealth";

export const dynamic = "force-dynamic";

// CSV of every EA reading at one sampling point (the "Download all readings" button on the sampling
// point page). Public data: Environment Agency Water Quality Archive, Open Government Licence.
//   /api/public/wq-samples?river=<slug>&point=<EA notation>

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const slug = sp.get("river") ?? "";
  const point = sp.get("point") ?? "";
  if (!slug || !point || point.length > 64) return new Response("river and point are required", { status: 400 });
  const river = await resolveRiver(slug);
  if (!river || !river.live) return new Response("Unknown river", { status: 404 });

  const { data, error } = await createPublicClient().rpc("public_wq_point_samples" as never, { p_org: river.orgId, p_notation: point } as never);
  if (error) return new Response("Could not load readings", { status: 502 });
  const rows = (data ?? []) as WqSample[];
  if (!rows.length) return new Response("No readings for that point", { status: 404 });

  const lines = [
    ["EA sampling point", "Sampled at (UTC)", "Test", "Qualifier", "Result", "Unit", "Sample material", "Purpose"].join(","),
    ...rows.map((r) =>
      [point, r.sampled_at, r.determinand, r.result_qualifier, r.result, r.unit, r.sample_material, r.purpose].map(csvCell).join(","),
    ),
    "",
    csvCell("Source: Environment Agency Water Quality Archive, Open Government Licence. Via River Hub."),
  ];
  const file = `ea-${point.replace(/[^A-Za-z0-9-]/g, "_")}-readings.csv`;
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
