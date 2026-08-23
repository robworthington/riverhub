"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PermitForm } from "@/components/PermitForm";
import { deletePermit } from "@/app/(app)/assets/actions";
import type { AssetPermit } from "@/lib/types";

type Mode = { kind: "none" } | { kind: "add" } | { kind: "edit"; permit: AssetPermit };

export function PermitsSection({
  assetId,
  permits,
  docUrls,
}: {
  assetId: string;
  permits: AssetPermit[];
  docUrls: Record<string, string | null>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(p: AssetPermit) {
    if (!confirm(`Delete permit ${p.permit_number ?? "(no number)"}? This cannot be undone.`)) return;
    setBusyId(p.id);
    setError(null);
    const res = await deletePermit(p.id, assetId);
    setBusyId(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      {permits.length ? (
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="py-1 pr-4">Number</th>
              <th className="py-1 pr-4">Start</th>
              <th className="py-1 pr-4">Revocation</th>
              <th className="py-1 pr-4">Permit DWF (m³/day)</th>
              <th className="py-1 pr-4">Permit FFT (m³/day)</th>
              <th className="py-1 pr-4">Design PE</th>
              <th className="py-1 pr-4">Storm storage (m³)</th>
              <th className="py-1 pr-4">Document</th>
              <th className="py-1 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {permits.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-1 pr-4">{p.permit_number ?? "—"}</td>
                <td className="py-1 pr-4">{p.permit_start_date ?? "—"}</td>
                <td className="py-1 pr-4">{p.permit_revocation_date ?? "—"}</td>
                <td className="py-1 pr-4">{p.permit_dwf_m3d ?? "—"}</td>
                <td className="py-1 pr-4">{p.permit_fft_m3d ?? "—"}</td>
                <td className="py-1 pr-4">{p.permit_pe ?? "—"}</td>
                <td className="py-1 pr-4">{p.required_storage_capacity ?? "—"}</td>
                <td className="py-1 pr-4">
                  <span className="flex gap-3">
                    {docUrls[p.id] ? (
                      <a href={docUrls[p.id]!} target="_blank" rel="noopener" className="text-river-700 underline">PDF</a>
                    ) : null}
                    {p.permit_url ? (
                      <a href={p.permit_url} target="_blank" rel="noopener" className="text-river-700 underline">EA page</a>
                    ) : null}
                    {!docUrls[p.id] && !p.permit_url ? <span className="text-gray-400">—</span> : null}
                  </span>
                </td>
                <td className="py-1 pr-4">
                  <span className="flex gap-3">
                    <button className="text-river-700 underline" onClick={() => setMode({ kind: "edit", permit: p })}>Edit</button>
                    <button className="text-red-600 underline disabled:opacity-50" disabled={busyId === p.id} onClick={() => onDelete(p)}>
                      {busyId === p.id ? "Deleting…" : "Delete"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-500">No permits recorded.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode.kind === "none" ? (
        <button className="btn-secondary" onClick={() => setMode({ kind: "add" })}>Add permit</button>
      ) : (
        <PermitForm
          assetId={assetId}
          permit={mode.kind === "edit" ? mode.permit : undefined}
          onDone={() => setMode({ kind: "none" })}
          onCancel={() => setMode({ kind: "none" })}
        />
      )}
    </div>
  );
}
