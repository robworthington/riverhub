"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/app/(app)/admin/users/actions";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "volunteer">("volunteer");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
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
        <label className="label">Full name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Email *</label>
        <input
          type="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "volunteer")}>
          <option value="volunteer">Volunteer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Inviting…" : "Send invite"}
      </button>
      {msg?.ok && <span className="text-sm text-green-600">Invite sent.</span>}
      {msg?.error && <span className="text-sm text-red-600">{msg.error}</span>}
    </form>
  );
}
