"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncNow } from "@/app/(app)/assets/actions";
import type { SyncSummary } from "@/lib/edm/sync";

export function SyncNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setSummary(null);
    const res = await syncNow();
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
        {busy ? "Syncing…" : "Sync EDM now"}
      </button>
      {summary && (
        <span className="text-sm text-gray-600">
          Checked {summary.assetsChecked} · wrote {summary.snapshotsWritten} · spilling{" "}
          {summary.spilling} · offline {summary.offline}
          {summary.errors.length ? ` · ${summary.errors.length} error(s)` : ""}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
