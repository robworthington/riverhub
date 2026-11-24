"use client";

import { useState, useTransition } from "react";
import { approveAdoption, declineAdoption, retryInvitation } from "@/app/(app)/admin/adoptions/actions";

type Res = { ok?: boolean; error?: string; note?: string };

/** Approve / decline / spam controls for one pending request. */
export function AdoptionDecision({ id, groupName, riverName }: { id: string; groupName: string; riverName: string }) {
  const [mode, setMode] = useState<"idle" | "decline">("idle");
  const [note, setNote] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Res>) => start(async () => setRes(await fn()));

  if (res?.ok) {
    return <p className="text-sm font-medium text-emerald-700">Done.{res.note ? ` ${res.note}` : ""}</p>;
  }
  return (
    <div className="space-y-2">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => {
              if (confirm(`Approve ${groupName} for the ${riverName}? Its pages will name the group straight away, and the contact will be invited as the river's admin.`)) {
                run(() => approveAdoption(id));
              }
            }}
          >
            {busy ? "Working…" : "Approve and invite"}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setMode("decline")}>Decline</button>
          <button
            className="btn-secondary text-gray-500"
            disabled={busy}
            onClick={() => confirm("Mark as spam? No email is sent.") && run(() => declineAdoption(id, "", true))}
          >
            Spam
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Note to the group (optional, included in the email)</span>
            <textarea className="input mt-1 w-full" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => run(() => declineAdoption(id, note, false))}>
              {busy ? "Working…" : "Decline and email the group"}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {res?.error && <p role="alert" className="text-sm font-medium text-red-700">{res.error}</p>}
    </div>
  );
}

/** For an approved request whose account set-up didn't finish. */
export function RetryInvitation({ id }: { id: string }) {
  const [res, setRes] = useState<Res | null>(null);
  const [busy, start] = useTransition();
  if (res?.ok) return <span className="text-xs text-emerald-700">Invited.{res.note ? ` ${res.note}` : ""}</span>;
  return (
    <span className="space-x-2">
      <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => start(async () => setRes(await retryInvitation(id)))}>
        {busy ? "Working…" : "Retry invitation"}
      </button>
      {res?.error && <span className="text-xs text-red-700">{res.error}</span>}
    </span>
  );
}
