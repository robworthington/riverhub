"use client";

import { useState } from "react";
import type { Evidence } from "@/lib/writeEvidence";

// Screen 2 (design_handoff_riverhub_intro). The six asks are copied verbatim from the design file.
const ASKS = [
  {
    id: "methods",
    title: "Publish the method, not just the promise",
    detail:
      "Ask the Environment Agency and Ofwat to publish how they assess whether a treatment works can serve the population connected to it — and to publish the results as open data, for every works.",
    evidence: "volunteers had to invent this method themselves; see How we know",
  },
  {
    id: "eo",
    title: "Report emergency overflows like storm overflows",
    detail:
      "Ask that emergency overflows be brought into the same near-real-time public reporting as storm overflows, instead of sitting in a separate category that only an information request can reach.",
    evidence: "EIR26209 — 18 overflows, 5,171 hours, no live feed",
  },
  {
    id: "plan",
    title: "Name the assets, in order, with dates",
    detail:
      "Ask for a published plan that names which assets will be fixed, in what order, at what cost, and by when — so bill payers can check progress against it.",
    evidence: "bills up 32% in April 2025; investment programme of £3.2bn to 2030",
  },
  {
    id: "regulator",
    title: "Make the new regulator publish an asset-level plan",
    detail:
      "The government is replacing Ofwat with a single water regulator. Ask that it be required, from day one, to publish an evidence-based plan at the level of individual assets — which works and overflows are failing, on what evidence, what the fix is, and when it happens — rather than sector-wide targets that nobody can check locally.",
    evidence: "the Cunliffe review's case for reform; no public asset-level plan exists today",
  },
  {
    id: "chronic",
    title: "Treat a chronic fault as a fault",
    detail:
      "Ask why an emergency overflow discharging for hundreds of hours a year is treated as permitted operation rather than as a failed asset requiring enforcement.",
    evidence: "an emergency overflow that ran for 105 days in one year",
  },
  {
    id: "winep",
    title: "Get the worst local assets into the next programme",
    detail:
      "Ask your MP to press for the assets in your own area to be included in the next round of environmental investment, and to ask what evidence is being used to choose.",
    evidence: "your local figures from step 1",
  },
];

const EXTREF = "https://riverhub.friendsofthedart.org/explore/spills/why-river-hub/write";

function StepMarker({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[14px] font-bold text-white">{n}</span>
  );
}

export function WriteTool({ evidence }: { evidence: Evidence }) {
  const [postcode, setPostcode] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const district = (pc: string): string | null => {
    const m = pc.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2}\d{1,2})/);
    return m ? m[1] : null;
  };

  const src = area && evidence.areas[area] ? evidence.areas[area] : evidence.catchment;
  const areaLabel =
    area === null
      ? ""
      : evidence.areas[area]
        ? `Showing ${evidence.areas[area].name}`
        : "Postcode outside the catchment — showing catchment-wide figures";

  const chosen = ASKS.filter((a) => selected.includes(a.id));
  const pc = postcode.trim();
  const params = new URLSearchParams({ a: "westminstermp", message_type: "campaigning", fyr_extref: EXTREF });
  if (pc) params.set("pc", pc);
  const wttUrl = `https://www.writetothem.com/?${params.toString()}`;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat(id)));

  const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy";

  return (
    <div className="grid grid-cols-1 gap-11 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {/* main column */}
      <div className="space-y-10">
        {/* Step 1 — evidence */}
        <section className="space-y-4">
          <div className="flex items-center gap-3.5">
            <StepMarker n={1} />
            <h2 className="font-serif text-[23px] font-bold text-brand-navyDeep">Get the evidence for where you live</h2>
          </div>
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setArea(district(postcode));
            }}
          >
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="Your postcode"
              autoComplete="postal-code"
              aria-label="Your postcode"
              className={`w-[190px] rounded-[4px] border border-brand-line5 px-3 py-[11px] text-[16px] ${focus}`}
            />
            <button type="submit" className={`rounded-[4px] bg-brand-navy px-[22px] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-navyDeep ${focus}`}>
              Show my local evidence
            </button>
          </form>

          <div className="overflow-hidden rounded-[6px] border border-brand-line2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-line2 bg-brand-surface px-[22px] py-3">
              <span className="text-[14px] font-semibold text-brand-navyDeep">{src.name} — figures you can quote</span>
              {areaLabel && <span className="text-[12.5px] text-brand-label">{areaLabel}</span>}
            </div>
            <div className="divide-y divide-brand-line3">
              {src.facts.map((f, i) => (
                <div key={i} className="flex gap-4 px-[22px] py-3.5">
                  <span className="w-[118px] shrink-0 font-serif text-[21px] font-bold leading-tight text-brand-accent">{f.value}</span>
                  <span className="text-[15px] leading-[1.6] text-brand-body">{f.text}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-line3 px-[22px] py-2.5 text-[13px] text-brand-label">
              Sources: Environment Agency EDM annual returns and the water company&apos;s EIR disclosure (EIR26209).
            </div>
          </div>
        </section>

        {/* Step 2 — choose asks */}
        <section className="space-y-4">
          <div className="flex items-center gap-3.5">
            <StepMarker n={2} />
            <h2 className="font-serif text-[23px] font-bold text-brand-navyDeep">Choose the points you want to make</h2>
          </div>
          <p className="text-[14.5px] text-brand-body">Pick two or three — a focused letter lands harder than a long one.</p>
          <div className="space-y-2.5">
            {ASKS.map((a) => {
              const on = selected.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex cursor-pointer gap-3.5 rounded-[6px] border p-[18px] transition-colors ${
                    on ? "border-brand-navy bg-brand-surfaceSel" : "border-brand-line4 bg-white hover:border-brand-navy"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="sr-only" />
                  <span
                    aria-hidden
                    className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border text-[12px] font-bold text-white ${
                      on ? "border-brand-navy bg-brand-navy" : "border-brand-line5 bg-white"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="space-y-1">
                    <span className="block text-[16px] font-semibold text-brand-navyDeep">{a.title}</span>
                    <span className="block text-[14.5px] leading-[1.6] text-brand-body">{a.detail}</span>
                    <span className="block text-[13.5px] text-brand-label">Evidence to cite: {a.evidence}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Step 3 — write it */}
        <section className="space-y-4">
          <div className="flex items-center gap-3.5">
            <StepMarker n={3} />
            <h2 className="font-serif text-[23px] font-bold text-brand-navyDeep">Write it, in your own words</h2>
          </div>
          <div className="space-y-3.5 rounded-[6px] border border-brand-line2 bg-brand-band px-[24px] py-[22px]">
            <p className="text-[15px] leading-[1.6] text-brand-body">
              Open WriteToThem, and write a short letter to your MP in your own words — a few honest sentences, using the
              figures and points above. Keep this page open beside it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href={wttUrl} target="_blank" rel="noopener" className={`rounded-[4px] bg-brand-navy px-[22px] py-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-navyDeep ${focus}`}>
                Open WriteToThem →
              </a>
              <button onClick={() => window.print()} className={`noprint rounded-[4px] border border-brand-line5 bg-white px-[22px] py-[13px] text-[15px] font-semibold text-brand-navyDeep transition-colors hover:bg-brand-surface ${focus}`}>
                Print my points
              </button>
              <span className="text-[13px] text-brand-label">{pc ? "Opens on the writing screen for your MP" : "Add your postcode above to skip a step"}</span>
            </div>
          </div>

          {/* caution box — not optional copy */}
          <div className="space-y-2.5 rounded-[6px] border border-l-[6px] border-brand-cautionBorder bg-brand-cautionBg px-[24px] py-[22px]">
            <h3 className="text-[15px] font-bold text-brand-cautionText">Why we don&apos;t give you a letter to paste</h3>
            <p className="text-[14.5px] leading-[1.65] text-brand-cautionText2">
              WriteToThem detects and blocks identical messages, and asking you to send pre-written text breaks their
              conditions of use — your message would be filtered out before it reached anyone. MPs also tell them they
              discount form letters. So we give you the local evidence and the asks, and you write the letter. Six honest
              sentences from a constituent beat a thousand identical ones.
            </p>
            <a href="https://www.writetothem.com/about-guidelines" target="_blank" rel="noopener" className="inline-block text-[14px] font-semibold text-brand-cautionText hover:underline">
              WriteToThem&apos;s guidelines for campaigners ↗
            </a>
          </div>
        </section>
      </div>

      {/* sticky "My points" panel */}
      <aside className="lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-[6px] border border-brand-line2">
          <div className="bg-brand-navyDeep px-[22px] py-4 text-white">
            <div className="font-serif text-[17px] font-bold">My points</div>
            <div className="text-[12.5px] text-brand-onNavy2">
              {chosen.length ? `${chosen.length} point${chosen.length === 1 ? "" : "s"} to make, in your own words` : "Keep this open while you write"}
            </div>
          </div>
          {chosen.length === 0 ? (
            <p className="px-[22px] py-5 text-[14px] text-brand-label">Choose points in step 2 and they appear here, with the evidence to cite.</p>
          ) : (
            <div className="divide-y divide-brand-line3">
              {chosen.map((a) => (
                <div key={a.id} className="px-[22px] py-3.5">
                  <div className="text-[14.5px] font-semibold text-brand-navyDeep">{a.title}</div>
                  <div className="text-[13.5px] text-brand-muted">Evidence: {a.evidence}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="noprint mt-4 rounded-[6px] border border-brand-line2 bg-brand-band px-[22px] py-4">
          <div className="text-[14px] font-semibold text-brand-navyDeep">Tell us you wrote</div>
          <p className="mt-1 text-[13px] leading-[1.55] text-brand-body">
            We can&apos;t see what you send. If you write, let us know so we can count it —{" "}
            <a href="https://www.friendsofthedart.org/contact" target="_blank" rel="noopener" className="font-semibold text-brand-navy hover:underline">get in touch</a>.
          </p>
        </div>
      </aside>
    </div>
  );
}
