import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ExportRow {
  date_collected: string;
  time_collected: string | null;
  result: number | null;
  result_class: string | null;
  condition: string | null;
  rainfall: number | null;
  temperature_c: number | null;
  salinity_ppt: number | null;
  person_collecting: string | null;
  organisation_collecting: string | null;
  other_observations: string | null;
  test_sites: { name: string } | null;
  test_types: { test_name: string; primary_unit: string | null } | null;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Auth: RLS already scopes rows to the caller's org; ensure they're signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sp = request.nextUrl.searchParams;
  let query = supabase
    .from("test_results")
    .select(
      "date_collected, time_collected, result, result_class, condition, rainfall, temperature_c, salinity_ppt, person_collecting, organisation_collecting, other_observations, test_sites(name), test_types(test_name, primary_unit)",
    )
    .order("date_collected", { ascending: false })
    .limit(5000);

  if (sp.get("site")) query = query.eq("site_id", sp.get("site")!);
  if (sp.get("type")) query = query.eq("test_type_id", sp.get("type")!);
  if (sp.get("from")) query = query.gte("date_collected", sp.get("from")!);
  if (sp.get("to")) query = query.lte("date_collected", sp.get("to")!);
  if (sp.get("condition")) query = query.eq("condition", sp.get("condition")! as "wet" | "dry");

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data as unknown as ExportRow[]) ?? [];

  const header = [
    "Date",
    "Time",
    "Site",
    "Test type",
    "Result",
    "Unit",
    "Risk rating",
    "Temperature (C)",
    "Salinity (ppt)",
    "Condition",
    "Rainfall",
    "Person",
    "Organisation",
    "Observations",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date_collected,
        r.time_collected,
        r.test_sites?.name,
        r.test_types?.test_name,
        r.result,
        r.test_types?.primary_unit,
        r.result_class,
        r.temperature_c,
        r.salinity_ppt,
        r.condition,
        r.rainfall,
        r.person_collecting,
        r.organisation_collecting,
        r.other_observations,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="river-hub-results.csv"',
    },
  });
}
