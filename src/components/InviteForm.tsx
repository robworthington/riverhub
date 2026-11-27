"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/app/(app)/admin/users/actions";
import { BASE_ROLES, BASE_ROLE_LABELS, type BaseRole } from "@/lib/tasks";

const HINT: Record<BaseRole, string> = {
  lead: "everything",
  coordinator: "data, sampling, photos, requests",
  volunteer: "enters results",
  viewer: "read-only",
};

export function InviteForm({ canMakeLead = false }: { canMakeLead?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<BaseRole>("volunteer");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await inviteUser(email, name, role);
    setBusy(false);
    setMsg(res);
    if (res.ok) {
      setEmail("");
      setName("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="invite-name">Full name</label>
        <input id="invite-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="invite-email">Email *</label>
        <input id="invite-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="invite-role">Role</label>
        <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as BaseRole)}>
          {BASE_ROLES.filter((r) => r !== "lead" || canMakeLead).map((r) => (
            <option key={r} value={r}>{BASE_ROLE_LABELS[r]} ({HINT[r]})</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Inviting…" : "Send invite"}
      </button>
      {msg?.ok && <span className="text-sm text-green-600">{msg.note ?? "Invite sent. You can change their tasks below."}</span>}
      {msg?.error && <span className="text-sm text-red-600">{msg.error}</span>}
    </form>
  );
}
