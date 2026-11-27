"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Manage this overflow" for signed-in members with the regulatory task on this river (Nov 2026).
 * Checked in the browser so the public page stays cached for everyone else. The members' page
 * switches to this river first if the member is working on another one (?org=).
 */
export function ManageOverflowLink({ assetId, orgId }: { assetId: string; orgId: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.rpc("has_task_on_river" as never, { task: "regulatory", river: orgId } as never);
      if (live && (data as unknown) === true) setShow(true);
    })();
    return () => { live = false; };
  }, [orgId]);
  if (!show) return null;
  return (
    <a
      href={`/assets/${assetId}?org=${orgId}`}
      className="inline-flex items-center rounded-[3px] border border-brand-navy px-3 py-1.5 text-[13px] font-semibold text-brand-navy hover:bg-brand-navy hover:text-white"
    >
      Manage this overflow
    </a>
  );
}
