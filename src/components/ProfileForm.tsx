"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfile } from "@/app/(app)/admin/users/actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await updateOwnProfile(name);
    setBusy(false);
    setMsg(res);
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Display name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {msg?.ok && <span className="text-sm text-green-600">Saved.</span>}
      {msg?.error && <span className="text-sm text-red-600">{msg.error}</span>}
    </form>
  );
}
