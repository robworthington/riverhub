"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateUserRole,
  setUserActive,
  resendInvite,
  revokeInvite,
  sendPasswordReset,
} from "@/app/(app)/admin/users/actions";
import type { AppRole } from "@/lib/types";

export interface UserRowData {
  id: string;
  name: string | null;
  email: string | null;
  role: AppRole;
  active: boolean;
  status: "active" | "invited" | "deactivated";
  lastSignIn: string | null;
  isSelf: boolean;
}

const STATUS = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  invited: { label: "Invited", cls: "bg-amber-50 text-amber-700" },
  deactivated: { label: "Deactivated", cls: "bg-gray-100 text-gray-500" },
} as const;

export function UserRow({ u }: { u: UserRowData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error?: string; ok?: boolean }>, okMsg?: string) {
    setBusy(true);
    setErr(null);
    setFlash(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setErr(res.error);
    else {
      if (okMsg) setFlash(okMsg);
      router.refresh();
    }
  }

  const st = STATUS[u.status];

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-4 py-2">
        <div className="font-medium text-gray-800">{u.name ?? "—"}{u.isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}</div>
        <div className="text-xs text-gray-500">{u.email ?? "—"}</div>
      </td>
      <td className="px-4 py-2">
        <select
          className="input py-1 text-sm"
          defaultValue={u.role}
          disabled={busy || u.isSelf}
          title={u.isSelf ? "You can't change your own role" : undefined}
          onChange={(e) => run(() => updateUserRole(u.id, e.target.value as AppRole))}
        >
          <option value="viewer">Viewer</option>
          <option value="volunteer">Volunteer</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">{u.lastSignIn ? u.lastSignIn.slice(0, 10) : "—"}</td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {u.status === "invited" && (
            <>
              <button className="btn-secondary py-1" disabled={busy} onClick={() => run(resendInvite.bind(null, u.id), "Invite re-sent")}>Resend</button>
              <button className="btn-secondary py-1" disabled={busy} onClick={() => { if (confirm("Revoke this invitation and remove the account?")) run(() => revokeInvite(u.id)); }}>Revoke</button>
            </>
          )}
          {u.status !== "invited" && (
            <button className="btn-secondary py-1" disabled={busy} onClick={() => run(sendPasswordReset.bind(null, u.id), "Reset email sent")}>Reset password</button>
          )}
          {u.active ? (
            !u.isSelf && <button className="btn-secondary py-1 text-red-700" disabled={busy} onClick={() => { if (confirm("Deactivate this account? They will be signed out and blocked.")) run(() => setUserActive(u.id, false)); }}>Deactivate</button>
          ) : (
            <button className="btn-secondary py-1" disabled={busy} onClick={() => run(() => setUserActive(u.id, true))}>Reactivate</button>
          )}
        </div>
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        {flash && <p className="mt-1 text-xs text-green-600">{flash}</p>}
      </td>
    </tr>
  );
}
