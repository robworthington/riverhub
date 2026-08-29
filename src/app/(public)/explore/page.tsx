import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${INSTANCE.portalName} — ${INSTANCE.orgName}`,
  description: `Open water-quality and sewage data for the ${INSTANCE.riverName} catchment: pollution map, bathing-water classifications, sewage-spill records and council-area summaries.`,
};

const SECTIONS = [
  {
    href: "/explore/spills",
    title: "Sewage spills",
    blurb:
      "Which storm overflows are spilling right now, and which spill when they shouldn't — live status, dry-weather spills, a league table and per-asset history from Environment Agency EDM returns.",
  },
  {
    href: "/explore/councils",
    title: "By council area",
    blurb:
      "Sewage assets, spills and treatment-works capacity broken down by district and parish.",
  },
];

export default async function ExploreHome() {
  const supabase = createPublicClient();
  const { data: assets } = await supabase.rpc("public_assets");

  const assetList = assets ?? [];
  const latestYear = assetList.reduce<number | null>(
    (max, a) => (a.latest_year != null && (max == null || a.latest_year > max) ? a.latest_year : max),
    null,
  );

  let drySpillCount: number | null = null;
  if (latestYear != null) {
    const { data: dry } = await supabase.rpc("public_dry_spills", { p_year: latestYear });
    drySpillCount = (dry ?? []).reduce((sum, d) => sum + (d.dry ?? 0), 0);
  }

  const stats: { label: string; value: string }[] = [
    { label: "Sewage assets tracked", value: assetList.length.toLocaleString() },
    {
      label: latestYear ? `Dry-weather spills (${latestYear})` : "Dry-weather spills",
      value: drySpillCount != null ? drySpillCount.toLocaleString() : "—",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-river-700 to-river-500 px-6 py-10 text-white sm:px-10">
        <h1 className="max-w-2xl text-3xl font-semibold sm:text-4xl">{INSTANCE.riverName} open data</h1>
        <p className="mt-3 max-w-2xl text-river-50">
          {INSTANCE.orgName} publishes the sewage-monitoring data we collect across the catchment.
          Follow storm-overflow spills — which overflows are spilling now and which spill when they
          shouldn&apos;t — or break the data down by council area.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/explore/spills" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-river-700 hover:bg-river-50">
            See sewage spills
          </Link>
          <Link href="/explore/councils" className="rounded-md border border-white/60 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
            Browse by council area
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl font-semibold text-river-700">{s.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card group transition hover:border-river-300 hover:shadow">
            <h2 className="text-lg font-semibold text-river-700 group-hover:underline">{s.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{s.blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
