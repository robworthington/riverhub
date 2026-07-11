"use client";

import { useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult, type CommitResult } from "@/app/(app)/results/import/actions";
import type { TestSite } from "@/lib/types";

export function ImportWizard({ sites }: { sites: Pick<TestSite, "id" | "name">[] }) {
  const [siteId, setSiteId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [done, setDone] = useState<CommitResult | null>(null);

  function reset() { setPreview(null); setDone(null); }

  async function onPreview() {
    if (!file) return;
    setBusy(true); setDone(null);
    const fd = new FormData(); fd.set("file", file);
    setPreview(await previewImport(fd));
    setBusy(false);
  }
  async function onCommit() {
    if (!file || !siteId) return;
    setBusy(true);
    const fd = new FormData(); fd.set("file", file); fd.set("site_id", siteId);
    setDone(await commitImport(fd));
    setBusy(false);
  }

  if (done?.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">
          Imported <strong>{done.imported}</strong> result{done.imported === 1 ? "" : "s"} across {done.visits} visits
          {done.errored ? `, skipped ${done.errored} row(s) with errors` : ""}.
        </p>
        <div className="flex gap-3">
          <Link href="/results" className="btn">View results</Link>
          <button className="btn-secondary" onClick={() => { setFile(null); reset(); }}>Import another file</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Site *</label>
        <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Select the site this file is for…</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="label">File (.xlsx or .csv) *</label>
        <input type="file" accept=".xlsx,.csv" className="block text-sm"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
      </div>

      {!preview && (
        <button className="btn" disabled={!file || busy} onClick={onPreview}>
          {busy ? "Reading…" : "Preview"}
        </button>
      )}

      {preview && !preview.ok && <p className="text-sm text-red-600">{preview.error}</p>}

      {preview?.ok && (
        <div className="space-y-3">
          <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
            <strong>{preview.summary!.visits}</strong> visits · <strong>{preview.summary!.measurements}</strong> measurements
            {preview.summary!.withErrors ? <> · <span className="text-red-600">{preview.summary!.withErrors} row(s) with errors (will be skipped)</span></> : ""}
            <div className="mt-1 text-xs text-gray-500">
              Measurement columns: {preview.measurementColumns?.join(", ") || "none"}.
              {preview.unmatchedColumns?.length ? ` Extra columns kept as context: ${preview.unmatchedColumns.join(", ")}.` : ""}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="py-1 pr-4">Row</th><th className="py-1 pr-4">Date</th><th className="py-1 pr-4">Time</th><th className="py-1 pr-4">Measurements</th><th className="py-1 pr-4">Issue</th></tr>
              </thead>
              <tbody>
                {preview.preview!.map((r) => (
                  <tr key={r.row} className="border-t border-gray-100">
                    <td className="py-1 pr-4 text-gray-400">{r.row}</td>
                    <td className="py-1 pr-4">{r.date ?? <span className="text-red-600">—</span>}</td>
                    <td className="py-1 pr-4 text-gray-500">{r.time ?? ""}</td>
                    <td className="py-1 pr-4">{r.measurements.map((m) => `${m.test_name}: ${m.qualifier === "=" ? "" : m.qualifier}${m.value ?? "?"}`).join("  ·  ")}</td>
                    <td className="py-1 pr-4 text-red-600">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-gray-400">Showing up to 12 rows.</p>
          </div>

          {done && !done.ok && <p className="text-sm text-red-600">{done.error}</p>}

          <div className="flex items-center gap-3">
            <button className="btn" disabled={!siteId || busy} onClick={onCommit}>
              {busy ? "Importing…" : `Import to ${sites.find((s) => s.id === siteId)?.name ?? "site"}`}
            </button>
            {!siteId && <span className="text-xs text-amber-700">Select a site above to enable import.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
