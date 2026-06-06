"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncEaNow } from "@/app/(app)/environment/actions";
import type { EaSyncSummary } from "@/lib/ea/sync";

export function EaSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<EaSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setSummary(null);
    const res = await syncEaNow();
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.summary) {
      setSummary(res.summary);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={run} className="btn" disabled={busy}>
        {busy ? "Syncing…" : "Sync rainfall / flow"}
      </button>
      {summary && (
        <span className="text-sm text-gray-600">
          {summary.flowRows} flow rows · {summary.rainfallRows} rainfall rows
          {summary.errors.length ? ` · ${summary.errors.length} error(s)` : ""}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
