"use client";

import { useState } from "react";
import { createApiKey, revokeApiKey } from "@/app/(app)/admin/api-keys/actions";

type KeyRow = { id: string; name: string | null; key_prefix: string; last_used_at: string | null; revoked: boolean; created_at: string };

export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true); setError(null); setNewKey(null);
    const res = await createApiKey(name);
    if (res.ok && res.key) { setNewKey(res.key); setName(""); } else setError(res.error ?? "Could not create key.");
    setBusy(false);
  }
  async function onRevoke(id: string) {
    if (!confirm("Revoke this key? Any integration using it will stop working immediately.")) return;
    setBusy(true); await revokeApiKey(id); setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label">New key name</label>
          <input className="input" placeholder="e.g. Lab data feed" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn" disabled={busy} onClick={onCreate}>{busy ? "…" : "Create key"}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {newKey && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Copy this key now — it won&rsquo;t be shown again:</p>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-amber-900">{newKey}</code>
          <p className="mt-2 text-xs text-amber-800">
            Use it as <code>Authorization: Bearer {newKey.slice(0, 12)}…</code> when calling <code>POST /api/import/results</code>.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr><th className="py-1 pr-4">Name</th><th className="py-1 pr-4">Prefix</th><th className="py-1 pr-4">Last used</th><th className="py-1 pr-4">Status</th><th className="py-1 pr-4"></th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-gray-100">
                <td className="py-1 pr-4">{k.name ?? <span className="text-gray-400">—</span>}</td>
                <td className="py-1 pr-4 font-mono text-gray-500">{k.key_prefix}…</td>
                <td className="py-1 pr-4 text-gray-500">{k.last_used_at ? k.last_used_at.slice(0, 10) : "never"}</td>
                <td className="py-1 pr-4">{k.revoked ? <span className="text-red-600">revoked</span> : <span className="text-emerald-700">active</span>}</td>
                <td className="py-1 pr-4">{!k.revoked && <button className="text-xs text-red-600 hover:underline" onClick={() => onRevoke(k.id)}>Revoke</button>}</td>
              </tr>
            ))}
            {!keys.length && <tr><td className="py-2 text-gray-500" colSpan={5}>No keys yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
