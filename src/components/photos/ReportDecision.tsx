"use client";

import { useState, useTransition } from "react";

export type DecideAction = (photoId: string, outcome: "kept" | "hidden") => Promise<{ error?: string }>;

export function ReportDecision({ photoId, wasHidden, decide }: { photoId: string; wasHidden: boolean; decide: DecideAction }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (outcome: "kept" | "hidden") =>
    start(async () => {
      const res = await decide(photoId, outcome);
      if (res.error) setError(res.error);
      else setDone(outcome === "kept" ? (wasHidden ? "Kept and put back on the public pages." : "Kept.") : "Hidden from the public pages.");
    });
  if (done) return <p className="text-sm font-medium text-emerald-700">{done}</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => run("kept")}>{wasHidden ? "Keep and restore" : "Keep"}</button>
        <button className="btn-secondary text-red-700" disabled={busy} onClick={() => confirm("Hide this photo from the public pages?") && run("hidden")}>Hide photo</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
