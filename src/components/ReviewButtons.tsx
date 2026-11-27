"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewResults } from "@/app/(app)/results/actions";

/** Approve / reject / reopen one result (sampling task). */
export function ReviewButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(next: "approved" | "rejected" | "pending") {
    setBusy(true);
    setErr(null);
    const res = await reviewResults([id], next, note);
    setBusy(false);
    if (res.error) setErr(res.error);
    else router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {status !== "approved" && <button className="btn py-1" disabled={busy} onClick={() => run("approved")}>Approve</button>}
      {status !== "rejected" && (
        <>
          <input className="input py-1 text-sm" placeholder="Reason (if rejecting)" aria-label="Reason for rejecting" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-secondary py-1 text-red-700" disabled={busy} onClick={() => run("rejected")}>Reject</button>
        </>
      )}
      {status === "approved" && <span className="text-xs text-gray-500">Approved.</span>}
      {err && <p className="w-full text-xs text-red-600">{err}</p>}
    </div>
  );
}
