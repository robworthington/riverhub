"use client";

import { useRouter } from "next/navigation";

export function ParishSelect({ parishes, current }: { parishes: { id: string; name: string }[]; current?: string }) {
  const router = useRouter();
  return (
    <select
      className="input"
      defaultValue={current ?? ""}
      onChange={(e) => {
        if (e.target.value) router.push(`/councils/parish/${e.target.value}`);
      }}
    >
      <option value="">Jump to a parish…</option>
      {parishes.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
