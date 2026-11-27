"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchRiver } from "@/lib/actions/switchRiver";

export type MemberOrg = { organisation_id: string; group_id?: string; label: string; is_active: boolean };

const keyOf = (o: MemberOrg) => `${o.organisation_id}:${o.group_id ?? ""}`;

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
    return only ? <span className="truncate text-[15px] font-semibold text-brand-navyDeep">{only.label}</span> : null;
  }

  const active = orgs.find((o) => o.is_active) ?? orgs[0];

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const key = e.target.value;
    if (key === keyOf(active)) return;
    const [orgId, groupId] = key.split(":");
    startTransition(async () => {
      await switchRiver(orgId, groupId || undefined);
      router.refresh();
    });
  }

  return (
    <select
      value={keyOf(active)}
      onChange={onChange}
      disabled={pending}
      aria-label="Switch river"
      title="Switch river"
      className="min-w-0 max-w-[8.5rem] rounded-[6px] border border-brand-line5 bg-white px-2 py-1.5 text-[13px] sm:max-w-[14rem] sm:text-[14px] font-semibold text-brand-navyDeep disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
    >
      {orgs.map((o) => (
        <option key={keyOf(o)} value={keyOf(o)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
