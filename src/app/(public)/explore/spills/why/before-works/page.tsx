import Link from "next/link";
import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;
export const metadata: Metadata = { title: `Before the works — ${INSTANCE.portalName}` };

export default function Page() {
  return (
    <div className="space-y-4 py-2">
      <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Before the works</h1>
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[22px] py-5">
        <p className="text-[14px] text-rh-ink2">Overflows that spilled while their own treatment works stayed shut — pointing at a local fault, not catchment-wide capacity. This page is being built.</p>
        <Link href="/explore/spills/why/capacity" className="mt-3 inline-block text-[13px] font-semibold text-rh-teal hover:underline">Works & capacity →</Link>
      </div>
    </div>
  );
}
