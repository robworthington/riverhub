"use client";

import { useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult, type CommitResult } from "@/app/(app)/results/import/actions";
import type { TestSite, TestType } from "@/lib/types";

const norm = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/[_-]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
const FIELD_LABELS: Record<string, string> = {
  rainfall: "Rainfall", observed_weather: "Weather", condition: "Condition", temperature_c: "Temperature", salinity_ppt: "Salinity",
};

export function ImportWizard({ sites, testTypes }: {
  sites: Pick<TestSite, "id" | "name">[];
  testTypes: Pick<TestType, "id" | "test_name">[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [columns, setColumns] = useState<{ header: string; role: string }[]>([]);
  const [siteMap, setSiteMap] = useState<Record<string, string>>({});
  const [saveName, setSaveName] = useState("");
  const [done, setDone] = useState<CommitResult | null>(null);

  const roleOptions = [
    { value: "ignore", label: "— ignore —" },
    { value: "date", label: "Date" }, { value: "time", label: "Time" }, { value: "site", label: "Site (from column)" },
    ...testTypes.map((t) => ({ value: `measure:${t.id}`, label: `Measure · ${t.test_name}` })),
    ...Object.entries(FIELD_LABELS).map(([k, l]) => ({ value: `field:${k}`, label: `Context · ${l}` })),
    { value: "context", label: "Keep as extra context" },
  ];
  const overrides = () => Object.fromEntries(columns.map((c) => [norm(c.header), c.role]));

  function suggestSite(name: string): string {
    const n = norm(name);
    return sites.find((s) => norm(s.name) === n)?.id ?? sites.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name)))?.id ?? "";
  }
  function keyFor(name: string) { return name || "*"; }

  async function runPreview(withOverrides: boolean) {
    if (!file) return;
    setBusy(true); setDone(null);
    const fd = new FormData(); fd.set("file", file);
    if (withOverrides) fd.set("overrides", JSON.stringify(overrides()));
    const res = await previewImport(fd);
    setPreview(res);
    if (res.ok) {
      setColumns(res.columns ?? []);
      const sm: Record<string, string> = { ...siteMap };
      for (const d of res.detectedSites ?? []) if (!(keyFor(d.name) in sm)) sm[keyFor(d.name)] = suggestSite(d.name);
      setSiteMap(sm);
    }
    setBusy(false);
  }
  async function onCommit() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file); fd.set("overrides", JSON.stringify(overrides()));
    fd.set("site_map", JSON.stringify(siteMap)); if (saveName.trim()) fd.set("save_profile_name", saveName.trim());
    setDone(await commitImport(fd));
    setBusy(false);
  }

  if (done?.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">
          Imported <strong>{done.imported}</strong> result{done.imported === 1 ? "" : "s"} across {done.visits} visits
          {done.errored ? `, skipped ${done.errored} row(s) with errors` : ""}
          {done.unresolved ? `, ${done.unresolved} row(s) had no matched site` : ""}.
        </p>
        <div className="flex gap-3">
          <Link href="/results" className="btn">View results</Link>
          <button className="btn-secondary" onClick={() => { setFile(null); setPreview(null); setColumns([]); setSiteMap({}); setDone(null); }}>Import another</button>
        </div>
      </div>
    );
  }

  const canImport = preview?.ok && Object.values(siteMap).some(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">File (.xlsx or .csv) *</label>
        <input type="file" accept=".xlsx,.csv" className="block text-sm"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setColumns([]); setSiteMap({}); setDone(null); }} />
      </div>

      {!preview && <button className="btn" disabled={!file || busy} onClick={() => runPreview(false)}>{busy ? "Reading…" : "Preview"}</button>}
      {preview && !preview.ok && <p className="text-sm text-red-600">{preview.error}</p>}

      {preview?.ok && (
        <div className="space-y-4">
          {preview.profileName && <p className="text-xs text-river-700">Applied saved mapping “{preview.profileName}”.</p>}

          <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
            <strong>{preview.summary!.visits}</strong> visits · <strong>{preview.summary!.measurements}</strong> measurements
            {preview.summary!.withErrors ? <> · <span className="text-red-600">{preview.summary!.withErrors} row(s) with errors (skipped)</span></> : ""}
          </div>

          {/* Column mapping */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Columns</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((c, i) => (
                <label key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-gray-600" title={c.header}>{c.header || <em>(blank)</em>}</span>
                  <select className="input max-w-[55%]" value={c.role}
                    onChange={(e) => setColumns((cs) => cs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>
                    {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button className="btn-secondary mt-2" disabled={busy} onClick={() => runPreview(true)}>Apply mapping &amp; re-scan</button>
          </div>

          {/* Site assignment */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Assign to sites</h3>
            <div className="space-y-2">
              {(preview.detectedSites ?? []).map((d) => (
                <label key={keyFor(d.name)} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-600">{d.name || "All rows (no site column)"} <span className="text-gray-400">· {d.count}</span></span>
                  <select className="input max-w-[55%]" value={siteMap[keyFor(d.name)] ?? ""}
                    onChange={(e) => setSiteMap((m) => ({ ...m, [keyFor(d.name)]: e.target.value }))}>
                    <option value="">— skip —</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Preview rows */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="py-1 pr-4">Row</th><th className="py-1 pr-4">Site</th><th className="py-1 pr-4">Date</th><th className="py-1 pr-4">Measurements</th><th className="py-1 pr-4">Issue</th></tr>
              </thead>
              <tbody>
                {preview.preview!.map((r) => (
                  <tr key={r.row} className="border-t border-gray-100">
                    <td className="py-1 pr-4 text-gray-400">{r.row}</td>
                    <td className="py-1 pr-4 text-gray-500">{r.site_name ?? "—"}</td>
                    <td className="py-1 pr-4">{r.date ?? <span className="text-red-600">—</span>}{r.time ? ` ${r.time}` : ""}</td>
                    <td className="py-1 pr-4">{r.measurements.map((m) => `${m.test_name}: ${m.qualifier === "=" ? "" : m.qualifier}${m.value ?? "?"}`).join("  ·  ")}</td>
                    <td className="py-1 pr-4 text-red-600">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-gray-400">Showing up to 12 rows.</p>
          </div>

          <div>
            <label className="label">Save this column mapping as a reusable profile (optional)</label>
            <input className="input" placeholder="e.g. Bathing-water spreadsheet" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          </div>

          {done && !done.ok && <p className="text-sm text-red-600">{done.error}</p>}
          <div className="flex items-center gap-3">
            <button className="btn" disabled={!canImport || busy} onClick={onCommit}>{busy ? "Importing…" : "Import"}</button>
            {!canImport && <span className="text-xs text-amber-700">Assign at least one detected site above.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
