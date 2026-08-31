import type { Metadata } from "next";
import { INSTANCE } from "@/lib/instance";
import { CALENDAR } from "@/lib/calendar";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `The calendar — ${INSTANCE.portalName}`,
  description: "The statutory dates that shape what can be done about sewage spills, and by when — bathing-water designation, RBMP consultations, WINEP investigation deadlines.",
};

export default function CalendarPage() {
  const now = Date.now();
  const sorted = [...CALENDAR].sort((a, b) => a.date.localeCompare(b.date));
  // the nearest future fixed date gets a live countdown
  const nextFixed = sorted.find((e) => !e.approximate && Date.parse(e.date) > now);

  return (
    <div className="space-y-6 py-2">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">The calendar</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">The statutory dates that decide what can be done, and by when. Miss the window and the lever is gone until the next cycle.</p>
      </div>

      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <table className="min-w-[600px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
              <th className="px-[18px] py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">What</th>
              <th className="px-[18px] py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const highlight = e.unverified;
              const isNext = nextFixed && e.date === nextFixed.date && !e.approximate;
              const days = isNext ? Math.ceil((Date.parse(e.date) - now) / 86_400_000) : null;
              return (
                <tr key={e.date + e.display} className={`border-b border-rh-rowDiv align-top ${highlight ? "bg-rh-alarmTint" : ""}`}>
                  <td className="px-[18px] py-3 font-plexmono text-[12.5px] font-semibold text-rh-ink">{e.display}</td>
                  <td className="px-3 py-3 text-rh-ink2">
                    {e.what}
                    {e.unverified && <span className="ml-1 font-semibold text-rh-alarm">(to confirm with Defra)</span>}
                  </td>
                  <td className="px-[18px] py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.status === "statutory"
                        ? <span className="inline-flex rounded-[2px] border border-[#bcd4cf] bg-[#eaf1ef] px-2 py-0.5 text-[11px] font-semibold text-rh-teal">Statutory</span>
                        : <span className="inline-flex rounded-[2px] border border-[#e8d3ab] bg-[#fbf1de] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a0c]">Forthcoming</span>}
                      {days != null && days >= 0 && <span className="font-plexmono text-[11px] font-semibold text-rh-alarm">{days} days</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">Where there is no window at all</h2>
        <p className="mt-2 max-w-[760px] text-[13px] leading-[1.55] text-rh-ink2">
          There is no public route to put a scheme on the environment programme, no right to be consulted on an individual discharge permit, and no third-party right of appeal against one. The counter-lever is the Environmental Information Regulations 2004: water companies are public authorities under them, and emissions information cannot be withheld on grounds of commercial confidentiality. A well-framed information request is often the only door that opens.
        </p>
      </div>

      <p className="text-[12px] text-rh-ink3">Dates flagged &ldquo;to confirm&rdquo; are drawn from the FoD reference report and should be reconfirmed with the responsible body before being quoted.</p>
    </div>
  );
}
