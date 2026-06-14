import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EA_THRESHOLD_MM } from "@/lib/dryspill";

export const dynamic = "force-dynamic";

interface ClassifiedRow {
  asset_id: string;
  asset_name: string | null;
  system_name: string | null;
  event_start: string;
  event_end: string | null;
  ongoing: boolean;
  duration_minutes: number | null;
  weather_class: string;
  max_rain: number | null;
  flow_m3s: number | null;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Bulk CSV of spill events with their dry/wet evidence columns (DRY-SPILL-UX-PROPOSAL.md §D export).
// RLS scopes to the caller's org. Params: window, year, asset, min (minutes), dry=1 (dry only).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sp = request.nextUrl.searchParams;
  const windowDays = [1, 3, 4].includes(Number(sp.get("window"))) ? Number(sp.get("window")) : 1;
  const year = sp.get("year") ? Number(sp.get("year")) : null;
  const asset = sp.get("asset") || null;
  const minMinutes = sp.get("min") ? Number(sp.get("min")) : 0;
  const dryOnly = sp.get("dry") === "1";

  const { data, error } = await supabase.rpc("classify_spills", {
    p_window: windowDays, p_threshold: EA_THRESHOLD_MM, p_asset: asset, p_year: year,
  });
  if (error) return new Response(error.message, { status: 500 });
  let rows = (data as unknown as ClassifiedRow[]) ?? [];
  rows = rows.filter((r) => r.duration_minutes == null || r.duration_minutes >= minMinutes);
  if (dryOnly) rows = rows.filter((r) => r.weather_class === "dry");

  // receptor flags + permit per asset (one lookup, mapped by asset_id)
  const { data: assets } = await supabase
    .from("sewage_assets")
    .select("id, asset_unique_id, bathing_water, shellfish_water");
  const meta = new Map(
    ((assets as { id: string; asset_unique_id: string | null; bathing_water: string | null; shellfish_water: string | null }[]) ?? [])
      .map((a) => [a.id, a]),
  );

  const header = [
    "Spill start", "Spill end", "Asset", "Unique ID", "System", "Weather class",
    "Duration (h)", "Max rainfall in window (mm)", "River flow (m3/s)", "Bathing water", "Shellfish water",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const m = meta.get(r.asset_id);
    lines.push([
      r.event_start, r.ongoing ? "ongoing" : (r.event_end ?? ""), r.asset_name ?? "",
      m?.asset_unique_id ?? "", r.system_name ?? "", r.weather_class,
      r.duration_minutes != null ? (r.duration_minutes / 60).toFixed(2) : "",
      r.max_rain ?? "", r.flow_m3s ?? "", m?.bathing_water ?? "", m?.shellfish_water ?? "",
    ].map(csvCell).join(","));
  }

  const fname = `dry-spills-${year ?? "all-years"}${dryOnly ? "-dry-only" : ""}.csv`;
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
    },
  });
}
