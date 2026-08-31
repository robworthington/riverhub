import Link from "next/link";
import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;
export const metadata: Metadata = { title: `The calendar — ${INSTANCE.portalName}` };

export default function Page() {
  return (
    <div className="space-y-4 py-2">
      <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">The calendar</h1>
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[22px] py-5">
        <p className="text-[14px] text-rh-ink2">The statutory dates that shape what can be done, and by when. This page is being built.</p>
        <Link href="/explore/spills/method" className="mt-3 inline-block text-[13px] font-semibold text-rh-teal hover:underline">How we know →</Link>
      </div>
    </div>
  );
}
