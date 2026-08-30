"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { linkMeasureToAsset, unlinkMeasure } from "@/app/(app)/assets/actions";

export type LinkedMeasure = { id: string; action_ref: string | null; action_name: string | null; driver_label: string | null; note: string | null };
export type AvailableMeasure = { id: string; action_ref: string | null; action_name: string | null; driver_label: string | null };

// Members-only: manage the deliberate measure↔asset links that feed the public "Problems & action"
// page. An asset with a flagged problem and no link here shows publicly as a gap.
export function AssetMeasuresManager({ assetId, linked, available, canEdit }: {
  assetId: string; linked: LinkedMeasure[]; available: AvailableMeasure[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 'available' is every measure; hide ones already linked (match on the WINEP action ref)
  const choices = available.filter((m) => !linked.some((l) => l.action_ref && l.action_ref === m.action_ref));

  async function onLink() {
    if (!sel) return;
    setBusy(true); setError(null);
    const res = await linkMeasureToAsset(assetId, sel, note);
    setBusy(false);
    if (res.error) setError(res.error);
    else { setSel(""); setNote(""); router.refresh(); }
  }
  async function onUnlink(linkId: string) {
    setBusy(true); setError(null);
    const res = await unlinkMeasure(linkId, assetId);
    setBusy(false);
    if (res.error) setError(res.error); else router.refresh();
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Linked measures</h2>
        <p className="text-xs text-gray-500">
          Measures deliberately linked to this overflow. On the public site, a flagged overflow with no linked measure is counted as a <strong>gap</strong>. (Distinct from the WINEP list above, which shows loose works/waterbody matches too.)
        </p>
      </div>

      {linked.length === 0 ? (
        <p className="text-sm text-gray-500">No measures linked yet{canEdit ? " — link one below." : "."}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {linked.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <div className="text-sm font-medium text-gray-800">{l.action_name ?? l.action_ref ?? "Measure"}</div>
                <div className="text-xs text-gray-500">
                  {l.action_ref && <span className="font-mono">{l.action_ref}</span>}
                  {l.driver_label && <span> · {l.driver_label}</span>}
                </div>
                {l.note && <div className="mt-0.5 text-xs italic text-gray-500">{l.note}</div>}
              </div>
              {canEdit && (
                <button onClick={() => onUnlink(l.id)} disabled={busy} className="shrink-0 text-xs text-red-600 hover:underline">
                  Unlink
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input flex-1" value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Choose a measure to link…</option>
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.action_ref ? `${m.action_ref} — ` : ""}{m.action_name ?? m.driver_label ?? "Measure"}
                </option>
              ))}
            </select>
            <button onClick={onLink} disabled={busy || !sel} className="btn shrink-0">
              {busy ? "Linking…" : "Link measure"}
            </button>
          </div>
          <input className="input" placeholder="Optional note (why this measure addresses this overflow)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
