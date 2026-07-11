// Shared result loader: canonical records -> resolved test_results rows -> idempotent upsert.
// Used by the import API route; framework-free (no exceljs), takes an injected Supabase client.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ImportMeasurement { test?: string; test_type_id?: string; value: number | string | null; qualifier?: string }
export interface ImportRecord {
  site?: string; site_id?: string;
  sampled_at?: string; date?: string; time?: string;
  condition?: string | null;
  rainfall?: number | null; temperature_c?: number | null; salinity_ppt?: number | null;
  context?: Record<string, unknown> | null;
  measurements: ImportMeasurement[];
}
export interface LoadResult { ok: boolean; records: number; imported: number; skipped: number; errors: { index: number; error: string }[] }

const norm = (s: string) => String(s).replace(/\([^)]*\)/g, "").trim().toLowerCase().replace(/\s+/g, " ");

export async function loadResults(
  admin: SupabaseClient<any>, orgId: string, records: ImportRecord[],
  source = "api", importId: string | null = null,
): Promise<LoadResult> {
  if (!Array.isArray(records)) return { ok: false, records: 0, imported: 0, skipped: 0, errors: [{ index: -1, error: "body must contain a `records` array" }] };

  const [{ data: sitesData }, { data: typesData }] = await Promise.all([
    admin.from("test_sites").select("id, name").eq("organisation_id", orgId),
    admin.from("test_types").select("id, test_name, common_name, test_code").eq("organisation_id", orgId),
  ]);
  const sites = (sitesData as { id: string; name: string }[]) ?? [];
  const types = (typesData as { id: string; test_name: string; common_name: string | null; test_code: string | null }[]) ?? [];
  const siteIds = new Set(sites.map((s) => s.id));
  const siteByName = new Map(sites.map((s) => [norm(s.name), s.id]));
  const typeIds = new Set(types.map((t) => t.id));

  const resolveType = (m: ImportMeasurement): string | null => {
    if (m.test_type_id && typeIds.has(m.test_type_id)) return m.test_type_id;
    if (!m.test) return null;
    const n = norm(m.test);
    const t = types.find((t) => [t.test_name, t.common_name, t.test_code].filter(Boolean).some((v) => norm(v as string) === n))
      ?? types.find((t) => norm(t.test_name).includes(n) || n.includes(norm(t.test_name)));
    return t?.id ?? null;
  };

  const errors: { index: number; error: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  records.forEach((r, i) => {
    const siteId = r.site_id && siteIds.has(r.site_id) ? r.site_id : (r.site ? siteByName.get(norm(r.site)) : undefined);
    if (!siteId) { errors.push({ index: i, error: `unknown site: ${r.site_id ?? r.site ?? "(none)"}` }); return; }

    let date = r.date ?? null, time = r.time ?? null;
    if (!date && r.sampled_at) { const m = String(r.sampled_at).match(/^(\d{4}-\d{2}-\d{2})[T ]?(\d{2}:\d{2})?/); if (m) { date = m[1]; time = time ?? (m[2] ?? null); } }
    if (!date) { errors.push({ index: i, error: "missing date / sampled_at (YYYY-MM-DD)" }); return; }
    if (!Array.isArray(r.measurements) || !r.measurements.length) { errors.push({ index: i, error: "no measurements" }); return; }

    const c = typeof r.condition === "string" ? r.condition.toLowerCase() : "";
    const condition = c.startsWith("w") ? "wet" : c.startsWith("d") ? "dry" : null;

    for (const m of r.measurements) {
      const tid = resolveType(m);
      if (!tid) { errors.push({ index: i, error: `unknown test: ${m.test ?? m.test_type_id ?? "(none)"}` }); continue; }
      const val = m.value == null || m.value === "" ? null : Number(m.value);
      rows.push({
        organisation_id: orgId, site_id: siteId, test_type_id: tid,
        date_collected: date, time_collected: time,
        result: Number.isFinite(val as number) ? val : null,
        result_qualifier: m.qualifier === "<" || m.qualifier === ">" ? m.qualifier : "=",
        rainfall: r.rainfall ?? null, temperature_c: r.temperature_c ?? null, salinity_ppt: r.salinity_ppt ?? null,
        condition, context: r.context && Object.keys(r.context).length ? r.context : null,
        source, source_ref: `${source}:${siteId}:${date}:${time ?? ""}:${tid}`, import_id: importId,
      });
    }
  });

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("test_results").upsert(chunk, { onConflict: "source_ref" });
    if (error) return { ok: false, records: records.length, imported, skipped: records.length - imported, errors: [...errors, { index: -1, error: error.message }] };
    imported += chunk.length;
  }
  return { ok: errors.length === 0, records: records.length, imported, skipped: errors.length, errors };
}
