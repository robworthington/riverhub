"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { linkMeasureToAsset } from "@/app/(app)/assets/actions";

export type UnlinkedMeasure = {
  id: string;
  action_ref: string | null;
  action_component: string | null;
  action_name: string | null;
  driver_code: string | null;
  driver_label: string | null;
  driver_obligation: string | null;
  completion_date: string | null;
  overdue: boolean;
  suggested_asset_id: string | null;
  suggested_asset_name: string | null;
  match_kind: string | null;
};

// Members-only queue: WINEP measures in the catchment not yet attached to a specific outlet. Linking
// here writes the same winep_asset_links row the per-asset manager does, so the measure then shows on
// that outlet and on the public register.
export function UnlinkedMeasuresList({ rows }: { rows: UnlinkedMeasure[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(m: UnlinkedMeasure) {
    if (!m.suggested_asset_id) return;
    setBusy(m.id);
    setError(null);
    const res = await linkMeasureToAsset(m.suggested_asset_id, m.id, "linked from the awaiting-linking queue");
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh(); // row drops out of the queue once linked
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{m.action_name ?? m.action_ref ?? "Measure"}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                {m.action_ref && <span className="font-mono">{m.action_ref}{m.action_component ? `/${m.action_component}` : ""}</span>}
                {m.driver_code && <span>· {m.driver_code}</span>}
                {m.completion_date && (
                  <span className={m.overdue ? "text-red-600" : ""}>· due {m.completion_date}{m.overdue ? " (overdue)" : ""}</span>
                )}
              </div>
              {m.driver_label && <div className="mt-0.5 text-xs text-gray-500">{m.driver_label}</div>}
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
              {m.suggested_asset_id ? (
                <>
                  <button
                    onClick={() => link(m)}
                    disabled={busy === m.id}
                    className="btn whitespace-nowrap text-xs"
                  >
                    {busy === m.id ? "Linking…" : `Link to ${m.suggested_asset_name}`}
                  </button>
                  <span className="text-[11px] text-gray-400">
                    {m.match_kind === "works-seg" ? "matches works name" : "nearest outlet"} ·{" "}
                    <Link href={`/assets/${m.suggested_asset_id}`} className="text-rh-teal hover:underline">
                      open to choose another
                    </Link>
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400">no suggested outlet — open an asset to link</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
