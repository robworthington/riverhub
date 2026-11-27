"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateMember,
  setUserActive,
  resendInvite,
  revokeInvite,
  sendPasswordReset,
  removeMember,
} from "@/app/(app)/admin/users/actions";
import { BASE_ROLES, BASE_ROLE_LABELS, TASKS, TASK_LABELS, defaultTasks, type BaseRole, type Task } from "@/lib/tasks";

export interface UserRowData {
  id: string;
  name: string | null;
  email: string | null;
  baseRole: BaseRole;
  tasks: Task[];
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

export function UserRow({ u, canMakeLead }: { u: UserRowData; canMakeLead: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [role, setRole] = useState<BaseRole>(u.baseRole);
  const [tasks, setTasks] = useState<Task[]>(u.tasks);

  // Only a lead can change a lead, or make someone a lead (the database enforces this too).
  const locked = u.isSelf || (u.baseRole === "lead" && !canMakeLead);
  const dirty = role !== u.baseRole || tasks.slice().sort().join() !== u.tasks.slice().sort().join();

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

  function pickRole(r: BaseRole) {
    setRole(r);
    setTasks(defaultTasks(r));
  }
  function toggle(t: Task) {
    setTasks((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  const st = STATUS[u.status];
  const fixedTasks = role === "lead" || role === "viewer";

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-4 py-2">
        <div className="font-medium text-gray-800">{u.name ?? "—"}{u.isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}</div>
        <div className="text-xs text-gray-500">{u.email ?? "—"}</div>
        <div className="text-xs text-gray-400">Last sign-in {u.lastSignIn ? u.lastSignIn.slice(0, 10) : "never"}</div>
      </td>
      <td className="px-4 py-2">
        <select
          className="input py-1 text-sm"
          value={role}
          disabled={busy || locked}
          aria-label={`Role for ${u.name ?? u.email ?? "member"}`}
          title={u.isSelf ? "You can't change your own role" : locked ? "Only a lead can change a lead" : undefined}
          onChange={(e) => pickRole(e.target.value as BaseRole)}
        >
          {BASE_ROLES.filter((r) => r !== "lead" || canMakeLead || u.baseRole === "lead").map((r) => (
            <option key={r} value={r}>{BASE_ROLE_LABELS[r]}</option>
          ))}
        </select>
        <fieldset className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" disabled={busy || locked || fixedTasks}>
          <legend className="sr-only">Tasks</legend>
          {TASKS.map((t) => (
            <label key={t} className="flex items-center gap-1.5" title={TASK_LABELS[t].hint}>
              <input type="checkbox" checked={role === "lead" || tasks.includes(t)} onChange={() => toggle(t)} />
              <span className={fixedTasks ? "text-gray-400" : "text-gray-700"}>{TASK_LABELS[t].label}</span>
            </label>
          ))}
        </fieldset>
        {dirty && !locked && (
          <div className="mt-2 flex gap-2">
            <button className="btn py-1 text-xs" disabled={busy} onClick={() => run(() => updateMember(u.id, role, tasks), "Saved")}>Save</button>
            <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => { setRole(u.baseRole); setTasks(u.tasks); }}>Cancel</button>
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {u.status === "invited" && (
            <>
              <button className="btn-secondary py-1" disabled={busy} onClick={() => run(resendInvite.bind(null, u.id), "Invite re-sent")}>Resend</button>
              {!locked && <button className="btn-secondary py-1" disabled={busy} onClick={() => { if (confirm("Cancel this invitation?")) run(() => revokeInvite(u.id)); }}>Cancel invite</button>}
            </>
          )}
          {u.status !== "invited" && (
            <button className="btn-secondary py-1" disabled={busy} onClick={() => run(sendPasswordReset.bind(null, u.id), "Reset email sent")}>Reset password</button>
          )}
          {!locked && u.status !== "invited" && (
            <button className="btn-secondary py-1 text-red-700" disabled={busy} onClick={() => { if (confirm("Remove them from this group? Their account, any other groups and the results they entered are kept.")) run(() => removeMember(u.id), "Removed from the group"); }}>Remove from group</button>
          )}
          {!locked && (u.active ? (
            u.status !== "invited" && <button className="btn-secondary py-1 text-red-700" disabled={busy} onClick={() => { if (confirm("Deactivate this account? They'll be signed out and blocked everywhere on River Hub.")) run(() => setUserActive(u.id, false)); }}>Deactivate</button>
          ) : (
            <button className="btn-secondary py-1" disabled={busy} onClick={() => run(() => setUserActive(u.id, true))}>Reactivate</button>
          ))}
        </div>
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        {flash && <p className="mt-1 text-xs text-green-600">{flash}</p>}
      </td>
    </tr>
  );
}
