"use client";

import { useState } from "react";
import { createSystem } from "@/app/(app)/assets/actions";

export function SystemForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await createSystem(
      String(fd.get("name") || ""),
      (fd.get("description") as string) || null,
    );
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="grow">
        <label className="label">Name *</label>
        <input name="name" required className="input" />
      </div>
      <div className="grow">
        <label className="label">Description</label>
        <input name="description" className="input" />
      </div>
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Add system"}</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
