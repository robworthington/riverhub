import Link from "next/link";
import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: `How we classify spills — ${INSTANCE.portalName}`,
  description: "How River Hub flags dry-weather spills, spills ahead of the treatment works, why very short spills are hidden, and what a quiet feed means.",
};

const CARDS: { title: string; accent: string; body: React.ReactNode }[] = [
  {
    title: "Dry spill",
    accent: "border-l-rh-dry",
    body: (
      <>
        Storm overflows are permitted to spill in heavy rain. A spill with <strong>no rain to excuse it</strong> usually
        means a blockage, a pump failure, or groundwater getting into the sewer. We flag a spill as <strong>dry</strong>{" "}
        when the nearest Environment Agency rain gauge recorded <strong>≤ 0.25 mm on the spill day and the day before</strong>.
        It is an investigate signal — presumptively non-compliant — not a proof of an offence.
      </>
    ),
  },
  {
    title: "Spilled before its treatment works",
    accent: "border-l-rh-prestw",
    body: (
      <>
        If the sewer network were genuinely overwhelmed, the treatment works&apos; own storm overflow would be spilling
        too. When an <strong>upstream</strong> overflow spills on a day its works does <strong>not</strong>, the problem is
        more likely <strong>local</strong> — a blockage on that branch — than catchment-wide capacity. We flag these as
        &ldquo;pre-STW&rdquo; spills.
      </>
    ),
  },
  {
    title: "Why very short spills are hidden",
    accent: "border-l-rh-nodata",
    body: (
      <>
        Monitors record in short intervals, and a single-interval blip often reflects sensor twitch rather than a real
        discharge. By default we <strong>exclude spills under 15 minutes</strong> so the counts reflect meaningful events.
        You can still see them where a &ldquo;show all&rdquo; option is offered.
      </>
    ),
  },
  {
    title: "When a feed goes quiet",
    accent: "border-l-rh-teal",
    body: (
      <>
        Near-real-time status comes from the water company&apos;s feed, which we poll <strong>hourly</strong>. Green means
        we heard from a monitor recently; amber means it has been quiet for a few hours; grey means over a day. A quiet
        monitor is <strong>not</strong> proof that nothing is spilling — it means nobody knows.
      </>
    ),
  },
];

export default function SpillsAboutPage() {
  return (
    <div className="mx-auto max-w-[720px] space-y-6 py-2">
      <Link href="/explore/spills" className="text-[13px] font-semibold text-rh-teal hover:underline">← All spills</Link>
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">How we classify</h1>
        <p className="mt-2 text-[15px] text-rh-ink2">
          What the flags on the {INSTANCE.riverName} spill pages mean, and how they are decided.
        </p>
      </div>
      <div className="space-y-3">
        {CARDS.map((c) => (
          <div key={c.title} className={`rounded-[3px] border border-rh-line border-l-4 ${c.accent} bg-rh-card px-6 py-5`}>
            <h2 className="text-[18px] font-bold text-rh-ink">{c.title}</h2>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-[#2c3c3e]">{c.body}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-rh-ink3">
        Figures come from Environment Agency Event Duration Monitoring returns and water-company near-real-time feeds. Not a substitute for official advice.
      </p>
    </div>
  );
}
