import { cachedRpc } from "@/lib/publicData";
import { RiverLink } from "@/components/public/RiverLink";

// "What we know about this river" (design canvas, null states). One line per layer of evidence, each
// at a step on its own ladder (loaded / partly known / requested / not yet), so a gap reads as a gap
// rather than a clean bill. Unclaimed rivers get an invitation for a local group to adopt them.

type RequestStep = {
  layer: string; status: string; sent_on: string | null; due_on: string | null;
  extended_to: string | null; answered_on: string | null; wdtk_url: string | null;
};
type Evidence = {
  steward: "group" | "river_hub"; group_name: string | null; group_url: string | null;
  overflows: number; monitors: number | null; reporting: number | null; live_as_of: string | null;
  record_from: number | null; record_to: number | null; winep_actions: number | null;
  works: number; works_assessed: number; capacity_response: boolean;
  eo_count: number; incidents_loaded: boolean; incidents: number; requests: RequestStep[];
};

type Level = "known" | "partial" | "requested" | "none";
type Line = { level: Level; layer: string; state: React.ReactNode; href?: string; linkLabel?: string };

const ICON: Record<Level, { glyph: string; cls: string; sr: string }> = {
  known: { glyph: "✓", cls: "text-rh-teal", sr: "Known" },
  partial: { glyph: "≈", cls: "text-rh-amber", sr: "Partly known" },
  requested: { glyph: "…", cls: "text-brand-navy", sr: "Requested" },
  none: { glyph: "–", cls: "text-rh-ink3", sr: "Not known yet" },
};

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** "requested 4 Nov 2026, reply due 2 Dec 2026" for an open request; "answered …" once replied. */
function requestText(r: RequestStep): string {
  if (["answered", "partial"].includes(r.status)) return `answered ${fmt(r.answered_on)}${r.status === "partial" ? " (in part)" : ""}`;
  if (r.status === "refused") return `refused ${fmt(r.answered_on)}`;
  if (r.status === "not_held") return "the authority says it doesn't hold it";
  if (r.status === "withdrawn") return "request withdrawn";
  if (r.status === "internal_review") return `requested ${fmt(r.sent_on)}, now under internal review`;
  if (r.status === "ico") return `requested ${fmt(r.sent_on)}, now with the Information Commissioner`;
  const due = r.extended_to ?? r.due_on;
  return `requested ${fmt(r.sent_on)}${due ? `, reply due ${fmt(due)}` : ""}`;
}

function RequestNote({ r }: { r: RequestStep | undefined }) {
  if (!r) return null;
  return (
    <>
      {" · "}
      {r.wdtk_url ? (
        <a href={r.wdtk_url} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">{requestText(r)}</a>
      ) : (
        requestText(r)
      )}
    </>
  );
}

const OPEN = ["sent", "acknowledged", "extended", "internal_review", "ico"];

export async function WhatWeKnow({ orgId, riverName }: { orgId: string; riverName: string }) {
  let rows: Evidence[] = [];
  try {
    rows = await cachedRpc<Evidence>("public_river_evidence", { p_org: orgId });
  } catch {
    return null;
  }
  const e = rows[0];
  if (!e) return null;
  const req = (layer: string) => (e.requests ?? []).find((r) => r.layer === layer);
  const permitReq = req("permits") ?? req("capacity");
  const eoReq = req("emergency_overflows");
  const incReq = req("incidents");
  const short = riverName.replace(/^River\s+/i, "");

  const lines: Line[] = [];

  lines.push(
    e.monitors && e.monitors > 0
      ? { level: "known", layer: "Live status", state: <>{e.reporting ?? 0} of {e.monitors} overflow monitors reporting, checked hourly</> }
      : { level: "none", layer: "Live status", state: "no live feed for this river yet" },
  );
  lines.push(
    e.record_from
      ? { level: "known", layer: "Spill record", state: <>every overflow, {e.record_from}{e.record_to && e.record_to !== e.record_from ? `–${e.record_to}` : ""}</>, href: "/explore/spills/calendar", linkLabel: "Calendar" }
      : { level: "none", layer: "Spill record", state: "not loaded yet" },
  );
  lines.push(
    e.winep_actions && e.winep_actions > 0
      ? { level: "known", layer: "Who is fixing it", state: <>{e.winep_actions} actions the regulator requires (WINEP)</>, href: "/explore/spills/measures", linkLabel: "Measures" }
      : { level: "none", layer: "Who is fixing it", state: "no WINEP actions on record" },
  );

  // Treatment-works capacity: needs each works' permitted flow.
  const capHref = "/explore/spills/why/capacity";
  if (e.works > 0 && e.works_assessed === e.works) {
    lines.push({ level: "known", layer: "Works capacity", state: <>all {e.works} treatment works assessed against their permits</>, href: capHref, linkLabel: "Capacity" });
  } else if (e.works_assessed > 0) {
    lines.push({ level: "partial", layer: "Works capacity", state: <>{e.works_assessed} of {e.works} works assessed; permits missing for the rest<RequestNote r={permitReq} /></>, href: capHref, linkLabel: "Capacity" });
  } else if (permitReq && OPEN.includes(permitReq.status)) {
    lines.push({ level: "requested", layer: "Works capacity", state: <>not yet assessed: permits <RequestNote r={permitReq} /></>, href: capHref, linkLabel: "Capacity" });
  } else {
    lines.push({ level: "none", layer: "Works capacity", state: <>not yet assessed: no permits loaded{e.works ? ` for its ${e.works} works` : ""}<RequestNote r={permitReq} /></>, href: capHref, linkLabel: "Why" });
  }

  lines.push({
    level: "partial",
    layer: "Population served",
    state: e.capacity_response ? "estimated from census areas, with the company's own figures for some works" : "estimated from census areas",
  });

  const eoHref = "/explore/spills/emergency-overflows";
  if (e.eo_count > 0) {
    lines.push({ level: "known", layer: "Emergency overflows", state: <>{e.eo_count} found by an information request</>, href: eoHref, linkLabel: "Records" });
  } else if (eoReq && OPEN.includes(eoReq.status)) {
    lines.push({ level: "requested", layer: "Emergency overflows", state: <>not in any feed: records <RequestNote r={eoReq} /></>, href: eoHref, linkLabel: "Why" });
  } else {
    lines.push({ level: "none", layer: "Emergency overflows", state: <>not yet requested from the water company<RequestNote r={eoReq} /></>, href: eoHref, linkLabel: "Why" });
  }

  if (e.incidents_loaded) {
    lines.push({
      level: incReq && ["answered", "partial"].includes(incReq.status) ? "known" : "partial",
      layer: "Pollution incidents",
      state: <>{e.incidents} serious sewage incident{e.incidents === 1 ? "" : "s"} near the network since 2000 (EA); minor ones aren&rsquo;t published<RequestNote r={incReq} /></>,
    });
  } else {
    lines.push({ level: "none", layer: "Pollution incidents", state: <>Environment Agency records not loaded yet<RequestNote r={incReq} /></> });
  }

  return (
    <section aria-labelledby="wwk-h" className="space-y-3 rounded-[6px] border border-rh-line bg-rh-cardAlt px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="wwk-h" className="text-[17px] font-bold text-rh-ink">What we know about the {short}</h2>
        {e.steward === "group" && e.group_name && (
          <span className="text-[12.5px] text-rh-ink2">
            Looked after by{" "}
            {e.group_url ? <a href={e.group_url} target="_blank" rel="noopener" className="font-semibold text-brand-navy hover:underline">{e.group_name}</a> : <strong>{e.group_name}</strong>}
          </span>
        )}
      </div>
      <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        {lines.map((l) => {
          const icon = ICON[l.level];
          return (
            <li key={l.layer} className="flex gap-2.5 text-[13.5px] leading-[1.45]">
              <span aria-hidden="true" className={`w-3 shrink-0 text-center font-bold ${icon.cls}`}>{icon.glyph}</span>
              <span className="sr-only">{icon.sr}:</span>
              <span className="min-w-0">
                <strong className="text-rh-ink">{l.layer}</strong> <span className="text-rh-ink2">{l.state}</span>
                {l.href && (
                  <>
                    {" "}
                    <RiverLink href={l.href} className="whitespace-nowrap text-[12.5px] font-semibold text-brand-navy hover:underline">{l.linkLabel ?? "More"} →</RiverLink>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {e.steward === "river_hub" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-dashed border-brand-dashed bg-white px-4 py-3">
          <p className="max-w-[62ch] text-[13.5px] leading-[1.5] text-rh-ink">
            <strong>No local group looks after the {short} on River Hub yet.</strong> A group can adopt it: their name on
            every page, and the tools to fill the gaps above.
          </p>
          <a
            href={`mailto:hello@riverhub.org?subject=${encodeURIComponent(`Adopting the ${riverName} on River Hub`)}`}
            data-umami-event="adopt-river"
            className="shrink-0 rounded-[4px] bg-brand-navyDeep px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-brand-navy"
          >
            Ask about adopting the {short}
          </a>
        </div>
      )}
    </section>
  );
}
