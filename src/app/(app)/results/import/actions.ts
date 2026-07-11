"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import { parseImport, detectFormat, type TestTypeRef, type CanonicalRecord } from "@/lib/import/pipeline";

export interface PreviewRow {
  row: number; date: string | null; time: string | null;
  measurements: { test_name: string; value: number | null; qualifier: string }[];
  errors: string[];
}
export interface PreviewResult {
  ok: boolean; error?: string;
  format?: "xlsx" | "csv";
  summary?: { visits: number; measurements: number; withErrors: number };
  preview?: PreviewRow[];
  unmatchedColumns?: string[];
  measurementColumns?: string[];
}

async function loadTypes(): Promise<TestTypeRef[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("test_types").select("id, test_name, common_name, test_code");
  return (data as TestTypeRef[]) ?? [];
}

async function parseForm(fd: FormData): Promise<{ records: CanonicalRecord[]; format: "xlsx" | "csv"; filename: string; unmatched: string[]; measure: string[] } | { error: string }> {
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > 8 * 1024 * 1024) return { error: "File is larger than 8 MB." };
  const format = detectFormat(file.name);
  if (!format) return { error: "Unsupported file type — use .xlsx or .csv." };
  const types = await loadTypes();
  const buf = await file.arrayBuffer();
  const { records, unmatchedColumns, measurementColumns } = await parseImport(buf, format, types);
  if (!measurementColumns.length) return { error: "No recognised measurement columns (e.g. E.Coli, IE). Check the header row." };
  return { records, format, filename: file.name, unmatched: unmatchedColumns, measure: measurementColumns };
}

export async function previewImport(fd: FormData): Promise<PreviewResult> {
  await requireEditor();
  const p = await parseForm(fd);
  if ("error" in p) return { ok: false, error: p.error };
  const measurements = p.records.reduce((n, r) => n + r.measurements.length, 0);
  const withErrors = p.records.filter((r) => r.errors.length).length;
  return {
    ok: true, format: p.format,
    summary: { visits: p.records.length, measurements, withErrors },
    unmatchedColumns: p.unmatched, measurementColumns: p.measure,
    preview: p.records.slice(0, 12).map((r) => ({
      row: r.row, date: r.date, time: r.time, errors: r.errors,
      measurements: r.measurements.map((m) => ({ test_name: m.test_name, value: m.value, qualifier: m.qualifier })),
    })),
  };
}

export interface CommitResult { ok: boolean; error?: string; imported?: number; errored?: number; visits?: number; importId?: string }

export async function commitImport(fd: FormData): Promise<CommitResult> {
  const profile = await requireEditor();
  const siteId = String(fd.get("site_id") || "");
  if (!siteId) return { ok: false, error: "Select a site." };
  const p = await parseForm(fd);
  if ("error" in p) return { ok: false, error: p.error };
  const supabase = await createClient();

  const good = p.records.filter((r) => !r.errors.length);
  const errored = p.records.length - good.length;

  const { data: imp, error: impErr } = await supabase.from("imports").insert({
    organisation_id: profile.organisation_id, filename: p.filename, format: p.format,
    site_id: siteId, uploaded_by: profile.id, rows_total: p.records.length, rows_error: errored,
  }).select("id").single();
  if (impErr || !imp) return { ok: false, error: impErr?.message ?? "Could not create the import." };
  const importId = (imp as { id: string }).id;

  const rows = good.flatMap((r) =>
    r.measurements.map((m) => ({
      organisation_id: profile.organisation_id,
      site_id: siteId,
      test_type_id: m.test_type_id,
      date_collected: r.date,
      time_collected: r.time,
      result: m.value,
      result_qualifier: m.qualifier,
      rainfall: r.fields.rainfall,
      temperature_c: r.fields.temperature_c,
      salinity_ppt: r.fields.salinity_ppt,
      condition: r.fields.condition,
      observed_weather: r.fields.observed_weather,
      context: Object.keys(r.context).length ? r.context : null,
      source: "upload",
      source_ref: `upload:${siteId}:${r.date}:${r.time ?? ""}:${m.test_type_id}`,
      import_id: importId,
    })),
  );

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("test_results").upsert(chunk, { onConflict: "source_ref" });
    if (error) return { ok: false, error: `Row load failed: ${error.message}` };
    imported += chunk.length;
  }
  await supabase.from("imports").update({ rows_imported: imported }).eq("id", importId);

  revalidatePath("/results");
  return { ok: true, imported, errored, visits: good.length, importId };
}
