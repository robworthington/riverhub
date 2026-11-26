import Link from "next/link";
import type { LiveStatus } from "@/lib/spillStatus";

// The members' dashboard view (data: src/app/(app)/dashboard/page.tsx, migration 0122).

export type DashboardJob = { key: string; n: number; title: string; detail: string; href: string; action: string; urgent?: boolean };
export type DashboardAction = { href: string; title: string; detail: string };

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function MemberDashboard({
  river, firstName, editor, jobs, actions, live, publicSpillsHref, sitesStale, sitesTotal, resultsMonth, adminTools,
}: {
  river: { name: string; group: string };
  firstName: string | null;
  editor: boolean;
  jobs: DashboardJob[];
  actions: DashboardAction[];
  live: Record<LiveStatus, number>;
  publicSpillsHref: string;
  sitesStale: number;
  sitesTotal: number;
  resultsMonth: number;
  /** admins only: maintenance controls shown at the foot of the page */
  adminTools?: React.ReactNode;
}) {
  const monitored = live.spilling + live.recent + live.ok + live.nodata;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">
          {river.group}{firstName ? ` · signed in as ${firstName}` : ""}
        </p>
        <h1>{river.name}</h1>
        <p className="max-w-[70ch] text-[16px] leading-[1.6] text-brand-body">
          What&rsquo;s waiting to be done on the {river.name}, what you can do, and what the river is doing now.
        </p>
      </div>

      <section aria-labelledby="jobs-h" className="space-y-3">
        <h2 id="jobs-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">Jobs waiting</h2>
        {jobs.length === 0 ? (
          <p className="card text-[15px] text-brand-body">Nothing is waiting. Requests, photos and links to check will appear here.</p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-rh-line bg-rh-card">
            {jobs.map((j, i) => (
              <li key={j.key} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 ${i ? "border-t border-rh-rowDiv" : ""}`}>
                <span className={`min-w-[3ch] font-plexmono text-[28px] font-semibold leading-none ${j.urgent ? "text-rh-alarm" : "text-brand-navyDeep"}`}>{j.n}</span>
                <span className="min-w-0 flex-1 basis-[18rem]">
                  <span className="block text-[15px] font-semibold text-rh-ink">{j.title}</span>
                  <span className="block text-[13.5px] leading-[1.5] text-rh-ink2">{j.detail}</span>
                </span>
                {editor || j.key === "adoptions" || j.key === "reports" ? (
                  <Link href={j.href} className="btn-secondary shrink-0">{j.action}</Link>
                ) : (
                  <Link href={j.href} className="shrink-0 text-[14px] font-semibold text-rh-teal hover:underline">View</Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {sitesStale > 0 && (
          <p className="text-[13.5px] text-rh-ink2">
            Worth checking: {plural(sitesStale, "sampling site")} of {sitesTotal} {sitesStale === 1 ? "has" : "have"} no result
            in the last 8 weeks (expected out of season).{" "}
            <Link href="/sites" className="font-semibold text-rh-teal hover:underline">See sites</Link>
          </p>
        )}
        {!editor && (
          <p className="text-[13.5px] text-rh-ink3">You can view these. To help with them, ask an admin on this river to make you a volunteer.</p>
        )}
      </section>

      <section aria-labelledby="do-h" className="space-y-3">
        <h2 id="do-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">Things you can do</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="group flex h-full flex-col gap-1 rounded-[10px] border border-rh-line bg-white px-5 py-4 transition-colors hover:border-rh-teal">
                <span className="text-[15px] font-semibold text-brand-navyDeep group-hover:underline">{a.title}</span>
                <span className="text-[13.5px] leading-[1.5] text-rh-ink2">{a.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="now-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="now-h" className="font-serif text-[22px] font-bold text-brand-navyDeep">On the river now</h2>
          <a href={publicSpillsHref} className="text-[14px] font-semibold text-rh-teal hover:underline">Live board</a>
        </div>
        {monitored === 0 ? (
          <p className="card text-[15px] text-brand-body">No live overflow data for the {river.name} yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat value={live.spilling} label="spilling now" tone="alarm" />
            <Stat value={live.recent} label="spilled in the last 48 hours" tone="amber" />
            <Stat value={monitored - live.nodata} label={`of ${monitored} monitors reporting`} tone="plain" />
          </div>
        )}
        {resultsMonth > 0 && (
          <p className="text-[13.5px] text-rh-ink2">{plural(resultsMonth, "water-quality result")} recorded this month.</p>
        )}
      </section>

      {adminTools && (
        <section aria-labelledby="admin-h" className="space-y-3 border-t border-brand-line2 pt-6">
          <h2 id="admin-h" className="text-[12px] font-semibold uppercase tracking-[.14em] text-brand-label">Admin</h2>
          {adminTools}
        </section>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "alarm" | "amber" | "plain" }) {
  const colour = tone === "alarm" && value > 0 ? "text-rh-alarm" : tone === "amber" && value > 0 ? "text-rh-amber" : "text-brand-navyDeep";
  return (
    <div className="card">
      <div className={`font-plexmono text-[30px] font-semibold leading-none ${colour}`}>{value}</div>
      <div className="mt-1.5 text-[13.5px] text-rh-ink2">{label}</div>
    </div>
  );
}
