import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { actionTypeFromDriver } from "@/lib/winep";
import { MeasuresRegister, type MeasureRow } from "@/components/public/MeasuresRegister";
import { PageHeaderBand, PageBody } from "@/components/public/PublicNav";

// Rendered per-request against the live DB — see gaps/page.tsx (ISR stale-empty pattern).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `What the regulator requires — ${INSTANCE.portalName}`,
  description: `The legally binding WINEP measures the regulator requires the water company to deliver against overflows in the ${INSTANCE.riverName} catchment — what each requires, its type, whether it is complete, and what it is attached to.`,
};

export default async function MeasuresPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_measures" as never, {} as never);
  const rows = (data ?? []) as unknown as MeasureRow[];

  const total = rows.length;
  const active = rows.filter((m) => !m.complete).length;
  const complete = rows.filter((m) => m.complete).length;
  const improvements = rows.filter((m) => actionTypeFromDriver(m.driver_code) === "improvement").length;

  const cards = [
    { value: total, label: "Measures in this catchment", sub: "WINEP, current record" },
    { value: active, label: "Still active", sub: "not yet past their date" },
    { value: complete, label: "Assumed complete", sub: "completion date has passed" },
    { value: improvements, label: "Are physical improvements", sub: "the rest investigate or monitor" },
  ];

  return (
    <>
      <PageHeaderBand
        title="What the regulator requires"
        intro="A measure is a specific action the regulator requires the water company to take at a named site — to investigate a problem, keep monitoring it, or physically fix it — each with a completion date. These are the legally binding measures on record for this catchment: what each requires, and what to watch."
      />
      <PageBody className="space-y-7">
      {/* legally-binding hero */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[26px] py-6">
        <p className="text-[17px] font-bold text-rh-ink">These measures are legally binding. Each one is a dated, site-specific requirement the company must deliver.</p>
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          The Water Industry National Environment Programme is how the Environment Agency turns statutory duties into named obligations at named sites, with a completion date attached. Where a measure requires a physical upgrade, the Agency writes the result into the site&apos;s environmental permit — and from that point the requirement is criminally enforceable.
        </p>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          The measure itself is public. <strong>What is not published is the water company&apos;s action to comply with it</strong> — its delivery is reported to the regulator and scored, but the underlying work, and whether a measure has actually resolved the problem on the ground, is not on the public record. What to watch is <strong>slippage</strong>: a measure can be re-dated or re-scoped, and until the permit is varied the obligation has not changed.
        </p>
      </div>

      {/* what the types mean */}
      <div className="rounded-[3px] border border-rh-line bg-rh-cardAlt px-[22px] py-5">
        <h2 className="text-[15px] font-bold text-rh-ink">What the types mean</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div><div className="text-[13px] font-bold text-rh-teal">Improvement</div><p className="mt-1 text-[12.5px] leading-[1.5] text-rh-ink2">A physical upgrade — bigger storage, better treatment, more capacity. This is the only type that actually fixes the problem on the ground.</p></div>
          <div><div className="text-[13px] font-bold text-rh-amber">Investigation</div><p className="mt-1 text-[12.5px] leading-[1.5] text-rh-ink2">A study of the cause. It produces a report, not a repair — an investigation must lead to an improvement before anything changes.</p></div>
          <div><div className="text-[13px] font-bold text-rh-label">Monitoring</div><p className="mt-1 text-[12.5px] leading-[1.5] text-rh-ink2">Installing or running instruments to measure the problem. Necessary evidence, but on its own it fixes nothing — it too has to be followed by an improvement.</p></div>
        </div>
        <p className="mt-3 text-[12px] text-rh-ink3">So an overflow whose only measures are investigations or monitoring is being looked at, not yet fixed. On the <a href="/explore/spills/gaps" className="text-rh-teal hover:underline">gaps page</a>, only a measure that is still active counts as action — a measure completed while the overflow is still failing does not.</p>
      </div>

      {/* stat cards */}
      <div className="flex flex-wrap gap-3">
        {cards.map((c) => (
          <div key={c.label} className="flex-[1_1_210px] rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-5 py-4">
            <div className="font-plexmono text-[32px] font-bold leading-none text-rh-teal">{c.value}</div>
            <div className="mt-1.5 text-[13.5px] font-semibold text-rh-ink">{c.label}</div>
            <div className="text-[12.5px] text-rh-ink3">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* register with filters */}
      <MeasuresRegister rows={rows} />

      {/* two closing panels */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-nodata bg-rh-cardAlt px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">There is no public change log</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">The live WINEP spreadsheet is internal, and there is no versioned public comparison or published reasons when a measure is re-dated or dropped. The only way to hold slippage to account is to archive every annual release and diff it yourself.</p>
        </div>
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-amber bg-rh-card px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">The 2027 pressure point</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">Most investigations must complete by 30 April 2027 to feed the 2030–35 programme. That date — not 2030 — is the one to hold: an investigation that slips past it cannot shape the next round of funded schemes.</p>
        </div>
      </div>
      </PageBody>
    </>
  );
}
