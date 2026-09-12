// Two ways to count the same discharges — kept consistent across the site.
//
//  • "spills"           = the Environment Agency's COUNTED spills, using the
//                         12/24-hour block rule. This is the regulator's
//                         headline figure and the unit the Storm Overflows
//                         Discharge Reduction Plan's "10 spills a year" cap and
//                         Ofwat's performance commitments are written in.
//  • "discharge events" = River Hub's count of every discrete monitor
//                         discharge (>= 15 minutes). Dry / wet / before-works
//                         are all classifications of these events.
//
// For short, frequent spillers the event count runs ~10x the counted-spills
// figure (Totnes 2025: 1,165 discharge events vs 123 counted spills), so which
// basis a number is on has to be explicit wherever a count is shown.

export type CountBasis = "counted" | "events";

export const BASIS_META: Record<CountBasis, { noun: string; nounSingular: string; short: string; hint: string }> = {
  counted: {
    noun: "spills",
    nounSingular: "spill",
    short: "EA counted",
    hint: "Counted spills — the Environment Agency's 12/24-hour block method. The regulator's headline figure and the unit of the 10-a-year cap.",
  },
  events: {
    noun: "discharge events",
    nounSingular: "discharge event",
    short: "River Hub",
    hint: "Discharge events — every discrete monitor discharge over 15 minutes. Runs higher than counted spills for short, frequent overflows.",
  },
};

// The plural-aware label for a figure, e.g. countLabel(1, "counted") => "1 spill".
export function countLabel(n: number, basis: CountBasis): string {
  const m = BASIS_META[basis];
  return `${n.toLocaleString()} ${n === 1 ? m.nounSingular : m.noun}`;
}

// One-line note used under any dual-count display and on the method page.
export const COUNTING_NOTE =
  "Two figures for the same discharges. Counted spills use the Environment Agency's 12/24-hour block rule — the first 12 hours of a block count as one spill, then each further 24-hour block adds one. It is the number the 10-a-year reduction cap is written in. Discharge events are every discrete discharge over 15 minutes; for short, frequent overflows there are many times more of them.";
