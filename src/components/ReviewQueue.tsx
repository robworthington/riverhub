"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { reviewResults } from "@/app/(app)/results/actions";

export type PendingResult = {
  id: string; date_collected: string; result: number | null; person_collecting: string | null;
  site: string; test: string; unit: string | null; entered_by: string | null;
};

export function ReviewQueue({ rows }: { rows: PendingResult[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(rows.map((r) => r.id)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const all = picked.size === rows.length;

  async function run(status: "approved" | "rejected") {
    if (status === "rejected" && !note.trim() && !confirm("Reject without a note? The person who entered them won't know why.")) return;
    setBusy(true);
    setMsg(null);
    const res = await reviewResults([...picked], status, note);
    setBusy(false);
    if (res.error) setMsg({ text: res.error, error: true });
    else {
      setMsg({ text: `${res.n} ${res.n === 1 ? "result" : "results"} ${status}.` });
      setNote("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" aria-label="Select all" checked={all}
                  onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Test</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Entered by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <input type="checkbox" aria-label={`Select ${r.site} ${r.date_collected}`} checked={picked.has(r.id)}
                    onChange={() => setPicked((cur) => { const n = new Set(cur); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                </td>
                <td className="px-3 py-2"><Link href={`/results/${r.id}`} className="text-river-700 hover:underline">{r.date_collected}</Link></td>
                <td className="px-3 py-2">{r.site}</td>
                <td className="px-3 py-2">{r.test}</td>
                <td className="px-3 py-2">{r.result ?? "—"}{r.result != null && r.unit ? ` ${r.unit}` : ""}</td>
                <td className="px-3 py-2 text-gray-600">{r.entered_by ?? r.person_collecting ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card flex flex-wrap items-end gap-3">
        <button className="btn" disabled={busy || !picked.size} onClick={() => run("approved")}>Approve {picked.size}</button>
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="rq-note">Note if rejecting (shown to whoever entered them)</label>
          <input id="rq-note" className="input w-full" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn-secondary text-red-700" disabled={busy || !picked.size} onClick={() => run("rejected")}>Reject {picked.size}</button>
        {msg && <p className={`w-full text-sm ${msg.error ? "text-red-600" : "text-green-700"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
