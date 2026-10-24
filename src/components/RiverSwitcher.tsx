"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchRiver } from "@/lib/actions/switchRiver";

export type MemberOrg = { organisation_id: string; label: string; is_active: boolean };

/**
 * Members river-switcher (B4). Shown in the app header. With a single membership it just labels the
 * current org; with more than one it is a dropdown that switches the active river (via switchRiver →
 * switch_org RPC) and refreshes so every org-scoped page re-reads for the new river.
 */
export function RiverSwitcher({ orgs }: { orgs: MemberOrg[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (orgs.length <= 1) {
    const only = orgs[0];
    return only ? <span className="hidden text-xs text-gray-400 sm:inline">{only.label}</span> : null;
  }

  const active = orgs.find((o) => o.is_active) ?? orgs[0];

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id === active.organisation_id) return;
    startTransition(async () => {
      await switchRiver(id);
      router.refresh();
    });
  }

  return (
    <select
      value={active.organisation_id}
      onChange={onChange}
      disabled={pending}
      aria-label="Switch river"
      title="Switch river"
      className="hidden max-w-[11rem] rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 disabled:opacity-60 sm:inline-block"
    >
      {orgs.map((o) => (
        <option key={o.organisation_id} value={o.organisation_id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
