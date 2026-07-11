"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import { parseImport, detectFormat, type TestTypeRef, type CanonicalRecord, type ColumnMap } from "@/lib/import/pipeline";

export interface PreviewRow {
  row: number; site_name: string | null; date: string | null; time: string | null;
  measurements: { test_name: string; value: number | null; qualifier: string }[]; errors: string[];
}
export interface PreviewResult {
  ok: boolean; error?: string;
  summary?: { visits: number; measurements: number; withErrors: number };
  columns?: ColumnMap[];
  detectedSites?: { name: string; count: number }[];
  preview?: PreviewRow[];
  headerSignature?: string;
  profileName?: string | null;
  profileMapping?: Record<string, string> | null;
}

async function loadTypes(): Promise<TestTypeRef[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("test_types").select("id, test_name, common_name, test_code");
  return (data as TestTypeRef[]) ?? [];
}

function readOverrides(fd: FormData): Record<string, string> | undefined {
  const raw = fd.get("overrides");
  if (!raw) return undefined;
  try { return JSON.parse(String(raw)); } catch { return undefined; }
}

async function parseForm(fd: FormData, overrides?: Record<string, string>) {
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file to upload." as string };
  if (file.size > 8 * 1024 * 1024) return { error: "File is larger than 8 MB." };
  const format = detectFormat(file.name);
  if (!format) return { error: "Unsupported file type — use .xlsx or .csv." };
  const types = await loadTypes();
  const parsed = await parseImport(await file.arrayBuffer(), format, types, overrides);
  return { ...parsed, format, filename: file.name };
}

export async function previewImport(fd: FormData): Promise<PreviewResult> {
  await requireEditor();
  const supabase = await createClient();
  let overrides = readOverrides(fd);

  // First pass to get the header signature, then apply a saved profile if one matches and the
  // caller hasn't supplied their own overrides.
  let profileName: string | null = null;
  let profileMapping: Record<string, string> | null = null;
  if (!overrides) {
    const first = await parseForm(fd);
    if ("error" in first) return { ok: false, error: first.error };
    const { data: prof } = await supabase.from("import_profiles")
      .select("name, mapping").eq("header_signature", first.headerSignature).maybeSingle();
    if (prof) { profileName = (prof as { name: string }).name; profileMapping = (prof as { mapping: Record<string, string> }).mapping; overrides = profileMapping; }
  }

  const p = await parseForm(fd, overrides);
  if ("error" in p) return { ok: false, error: p.error };
  const measurements = p.records.reduce((n, r) => n + r.measurements.length, 0);
  const withErrors = p.records.filter((r) => r.errors.length).length;
  const counts = new Map<string, number>();
  for (const r of p.records) counts.set(r.site_name ?? "", (counts.get(r.site_name ?? "") ?? 0) + 1);
  return {
    ok: true,
    summary: { visits: p.records.length, measurements, withErrors },
    columns: p.columns,
    detectedSites: [...counts.entries()].map(([name, count]) => ({ name, count })),
    headerSignature: p.headerSignature, profileName, profileMapping,
    preview: p.records.slice(0, 12).map((r) => ({
      row: r.row, site_name: r.site_name, date: r.date, time: r.time, errors: r.errors,
      measurements: r.measurements.map((m) => ({ test_name: m.test_name, value: m.value, qualifier: m.qualifier })),
    })),
  };
}

export interface CommitResult { ok: boolean; error?: string; imported?: number; errored?: number; unresolved?: number; visits?: number }

export async function commitImport(fd: FormData): Promise<CommitResult> {
  const profile = await requireEditor();
  const supabase = await createClient();
  const overrides = readOverrides(fd);
  const siteMap: Record<string, string> = (() => { try { return JSON.parse(String(fd.get("site_map") || "{}")); } catch { return {}; } })();
  const saveProfileName = String(fd.get("save_profile_name") || "").trim();

  const p = await parseForm(fd, overrides);
  if ("error" in p) return { ok: false, error: p.error };

  const resolveSite = (rec: CanonicalRecord) => siteMap[rec.site_name ?? ""] ?? siteMap["*"] ?? null;
  const usable = p.records.filter((r) => !r.errors.length);
  const errored = p.records.length - usable.length;
  const withSite = usable.filter((r) => resolveSite(r));
  const unresolved = usable.length - withSite.length;
  if (!withSite.length) return { ok: false, error: "No rows could be matched to a site — assign the detected sites below." };

  const { data: imp, error: impErr } = await supabase.from("imports").insert({
    organisation_id: profile.organisation_id, filename: p.filename, format: p.format,
    site_id: resolveSite(withSite[0]),
    uploaded_by: profile.id, rows_total: p.records.length, rows_error: errored,
  }).select("id").single();
  if (impErr || !imp) return { ok: false, error: impErr?.message ?? "Could not create the import." };
  const importId = (imp as { id: string }).id;

  const rows = withSite.flatMap((r) => {
    const siteId = resolveSite(r)!;
    return r.measurements.map((m) => ({
      organisation_id: profile.organisation_id, site_id: siteId, test_type_id: m.test_type_id,
      date_collected: r.date, time_collected: r.time, result: m.value, result_qualifier: m.qualifier,
      rainfall: r.fields.rainfall, temperature_c: r.fields.temperature_c, salinity_ppt: r.fields.salinity_ppt,
      condition: r.fields.condition, observed_weather: r.fields.observed_weather,
      context: Object.keys(r.context).length ? r.context : null,
      source: "upload", source_ref: `upload:${siteId}:${r.date}:${r.time ?? ""}:${m.test_type_id}`, import_id: importId,
    }));
  });

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.from("test_results").upsert(chunk, { onConflict: "source_ref" });
    if (error) return { ok: false, error: `Row load failed: ${error.message}` };
    imported += chunk.length;
  }
  await supabase.from("imports").update({ rows_imported: imported }).eq("id", importId);

  if (saveProfileName && overrides && p.headerSignature) {
    await supabase.from("import_profiles").upsert({
      organisation_id: profile.organisation_id, name: saveProfileName,
      header_signature: p.headerSignature, mapping: overrides, created_by: profile.id,
    }, { onConflict: "organisation_id,header_signature" });
  }

  revalidatePath("/results");
  return { ok: true, imported, errored, unresolved, visits: withSite.length };
}
