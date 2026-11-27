"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelInvitation, declineRequest, inviteFromRequest, resendInvitation } from "@/app/(app)/admin/users/actions";
import { BASE_ROLE_LABELS, type BaseRole } from "@/lib/tasks";

export type OpenInvite = { id: string; email: string; full_name: string | null; base_role: BaseRole; sent_at: string; expires_at: string };
export type JoinRequest = { id: string; name: string; email: string; message: string | null; created_at: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  async function run(id: string, fn: () => Promise<{ error?: string; ok?: boolean; note?: string }>, okText: string) {
    setBusy(id);
    setMsg(null);
    const res = await fn();
    setBusy(null);
    setMsg({ id, text: res.error ?? res.note ?? okText, error: !!res.error });
    if (!res.error) router.refresh();
  }
  return { busy, msg, run };
}

/** Invitations sent but not yet accepted. */
export function OpenInvites({ invites }: { invites: OpenInvite[] }) {
  const { busy, msg, run } = useRun();
  if (!invites.length) return null;
  return (
    <div className="card">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Waiting to accept ({invites.length})</h2>
      <ul className="divide-y divide-gray-100 text-sm">
        {invites.map((i) => {
          const expired = new Date(i.expires_at) < new Date();
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium text-gray-800">{i.full_name ?? i.email}</span>
                {i.full_name && <span className="ml-1 text-gray-500">{i.email}</span>}
                <div className="text-xs text-gray-500">
                  {BASE_ROLE_LABELS[i.base_role]} · sent {day(i.sent_at)} · {expired ? <span className="text-red-700">expired {day(i.expires_at)}</span> : `expires ${day(i.expires_at)}`}
                </div>
                {msg?.id === i.id && <p className={`mt-1 text-xs ${msg.error ? "text-red-600" : "text-green-700"} break-all`}>{msg.text}</p>}
              </div>
              <div className="flex gap-2 text-xs">
                <button className="btn-secondary py-1" disabled={busy === i.id} onClick={() => run(i.id, () => resendInvitation(i.id), "Sent again")}>Resend</button>
                <button className="btn-secondary py-1 text-red-700" disabled={busy === i.id} onClick={() => { if (confirm(`Cancel the invitation to ${i.email}?`)) run(i.id, () => cancelInvitation(i.id), "Cancelled"); }}>Cancel</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** People who asked to join from the group's public page. */
export function JoinRequests({ requests, canMakeLead }: { requests: JoinRequest[]; canMakeLead: boolean }) {
  const { busy, msg, run } = useRun();
  const [roles, setRoles] = useState<Record<string, BaseRole>>({});
  if (!requests.length) return null;
  return (
    <div className="card">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Asked to join ({requests.length})</h2>
      <ul className="divide-y divide-gray-100 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="space-y-1 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium text-gray-800">{r.name}</span> <span className="text-gray-500">{r.email}</span>
                <span className="ml-1 text-xs text-gray-400">{day(r.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <select className="input py-1 text-xs" aria-label={`Role for ${r.name}`} value={roles[r.id] ?? "volunteer"}
                  onChange={(e) => setRoles((cur) => ({ ...cur, [r.id]: e.target.value as BaseRole }))}>
                  {(["viewer", "volunteer", "coordinator", ...(canMakeLead ? ["lead"] : [])] as BaseRole[]).map((b) => (
                    <option key={b} value={b}>{BASE_ROLE_LABELS[b]}</option>
                  ))}
                </select>
                <button className="btn py-1" disabled={busy === r.id} onClick={() => run(r.id, () => inviteFromRequest(r.id, roles[r.id] ?? "volunteer"), "Invitation sent")}>Invite</button>
                <button className="btn-secondary py-1" disabled={busy === r.id} onClick={() => run(r.id, () => declineRequest(r.id), "Declined")}>Decline</button>
                <button className="btn-secondary py-1 text-red-700" disabled={busy === r.id} onClick={() => run(r.id, () => declineRequest(r.id, true), "Marked as spam")}>Spam</button>
              </div>
            </div>
            {r.message && <p className="whitespace-pre-line text-xs text-gray-600">{r.message}</p>}
            {msg?.id === r.id && <p className={`text-xs ${msg.error ? "text-red-600" : "text-green-700"} break-all`}>{msg.text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
