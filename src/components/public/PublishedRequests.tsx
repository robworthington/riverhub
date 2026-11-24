import { createPublicClient } from "@/lib/supabase/public";
import { publicRpc } from "@/lib/supabase/publicRpc";
import { overflowLabel } from "@/lib/overflowNames";
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_LABEL, daysUntil, effectiveDue, fmtDate, LAYER_LABEL } from "@/lib/requests";
import type { InfoRequestLaw, InfoRequestLayer, InfoRequestStatus } from "@/lib/types";
import { RiverLink } from "@/components/public/RiverLink";

// Information requests a river's group (or River Hub) has chosen to publish, from the members'
// request log (migrations 0098, 0104). Renders nothing until at least one is published: the
// "What we know" panel already says which gaps nobody has asked about yet.
//   variant "river": every published request, with the overflows each is about, on the live board.
//   variant "asset": only requests linked to one overflow or works, on its page.

type Asset = { id: string; name: string; type: string | null };
type PublicRequest = {
  id: string; authority: string; law: InfoRequestLaw; layer: InfoRequestLayer; title: string;
  status: InfoRequestStatus; sent_on: string | null; due_on: string | null; extended_to: string | null;
  answered_on: string | null; wdtk_url: string | null; data_loaded: boolean; assets: Asset[];
};

const LAW_SHORT: Record<InfoRequestLaw, string> = { eir: "EIR", foi: "FOI" };

// Public-facing wording for each status: the same steps as the members' log, phrased for a visitor.
const PUBLIC_STATUS: Partial<Record<InfoRequestStatus, string>> = {
  sent: "Awaiting reply",
  acknowledged: "Awaiting reply",
  ico: "With the Information Commissioner",
  not_held: "Not held",
};

const TONE: Record<"open" | "late" | "answered" | "refused" | "other", string> = {
  open: "border-rh-line bg-rh-cardAlt text-brand-navy",
  late: "border-[#e8b6ae] bg-rh-alarmTint text-rh-alarmDeep",
  answered: "border-[#b9dcd3] bg-[#eef7f4] text-rh-teal",
  refused: "border-rh-chipAmberBorder bg-rh-chipAmberBg text-rh-amber",
  other: "border-rh-line bg-white text-rh-ink2",
};

/** The chip and the line under the title: where the request has got to, and by when. */
function progress(r: PublicRequest): { chip: string; tone: keyof typeof TONE; detail: string } {
  const chip = PUBLIC_STATUS[r.status] ?? STATUS_LABEL[r.status];
  const sent = r.sent_on ? `Sent ${fmtDate(r.sent_on)}` : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  if (OPEN_STATUSES.includes(r.status) || r.status === "ico") {
    const due = effectiveDue(r);
    if (r.status === "ico") return { chip, tone: "refused", detail: join(sent, "complaint with the ICO") };
    if (!due) return { chip, tone: "open", detail: sent };
    const n = daysUntil(due);
    const extended = r.extended_to ? " (extended)" : "";
    if (n < 0 && r.status !== "internal_review") {
      return { chip: "Reply overdue", tone: "late", detail: join(sent, `reply was due ${fmtDate(due)}${extended}, ${-n} day${n === -1 ? "" : "s"} ago`) };
    }
    return { chip, tone: "open", detail: join(sent, `${r.status === "internal_review" ? "review" : "reply"} due ${fmtDate(due)}${extended}`) };
  }
  if (r.status === "answered" || r.status === "partial") {
    return { chip, tone: "answered", detail: join(sent, r.answered_on ? `answered ${fmtDate(r.answered_on)}` : "") };
  }
  if (r.status === "refused") {
    return { chip, tone: "refused", detail: join(sent, r.answered_on ? `refused ${fmtDate(r.answered_on)}` : "") };
  }
  return { chip, tone: CLOSED_STATUSES.includes(r.status) ? "other" : "open", detail: sent };
}

function AssetLinks({ assets }: { assets: Asset[] }) {
  if (!assets.length) return null;
  const shown = assets.slice(0, 3);
  const more = assets.length - shown.length;
  return (
    <span className="text-rh-ink2">
      About{" "}
      {shown.map((a, i) => (
        <span key={a.id}>
          {i > 0 && (i === shown.length - 1 && !more ? " and " : ", ")}
          <RiverLink href={`/explore/spills/${a.id}`} className="font-semibold text-brand-navy hover:underline">
            {overflowLabel(a.name, a.type)}
          </RiverLink>
        </span>
      ))}
      {more > 0 && <> and {more} more</>}
    </span>
  );
}

function Row({ r, showAssets }: { r: PublicRequest; showAssets: boolean }) {
  const p = progress(r);
  return (
    <li className="space-y-1 px-4 py-3 text-[13.5px]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 font-semibold text-rh-ink">
          {r.wdtk_url ? (
            <a href={r.wdtk_url} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">
              {r.title}
            </a>
          ) : (
            r.title
          )}
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE[p.tone]}`}>{p.chip}</span>
      </div>
      <p className="text-[12.5px] text-rh-ink3">
        To {r.authority} · {LAW_SHORT[r.law]} · {LAYER_LABEL[r.layer]}
        {p.detail && <> · {p.detail}</>}
      </p>
      {(r.data_loaded || (showAssets && r.assets.length > 0) || r.wdtk_url) && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
          {showAssets && <AssetLinks assets={r.assets} />}
          {r.data_loaded && <span className="font-semibold text-rh-teal">Reply loaded into River Hub</span>}
          {r.wdtk_url && (
            <a href={r.wdtk_url} target="_blank" rel="noopener noreferrer" className="text-brand-navy underline-offset-2 hover:underline">
              Letters and reply on WhatDoTheyKnow ↗
            </a>
          )}
        </p>
      )}
    </li>
  );
}

function Footnote() {
  return (
    <p className="text-[11.5px] leading-[1.5] text-rh-ink3">
      Requests under the Environmental Information Regulations (EIR) and the Freedom of Information Act (FOI). Public
      bodies and water companies must reply within 20 working days; under EIR they can extend that to 40 for complex
      requests. Where a request was made through WhatDoTheyKnow, the letters and any reply are public there.
    </p>
  );
}

export async function PublishedRequests({
  orgId, riverName, groupName, assetId, variant = "river",
}: { orgId: string; riverName: string; groupName?: string | null; assetId?: string; variant?: "river" | "asset" }) {
  const supabase = createPublicClient();
  const rows = await publicRpc<PublicRequest>(
    supabase,
    "public_info_requests",
    assetId ? { p_org: orgId, p_asset: assetId } : { p_org: orgId },
  );
  if (!rows.length) return null;
  for (const r of rows) r.assets ??= []; // tolerate the pre-0104 reader, which had no assets column

  if (variant === "asset") {
    return (
      <section aria-labelledby="asset-requests-h" className="space-y-2.5">
        <h2 id="asset-requests-h" className="text-[16px] font-bold text-rh-ink">Information requests about this overflow</h2>
        <ol className="divide-y divide-rh-line rounded-[3px] border border-rh-line bg-white">
          {rows.map((r) => <Row key={r.id} r={r} showAssets={false} />)}
        </ol>
        <Footnote />
      </section>
    );
  }

  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status) || r.status === "ico").length;
  const overdue = rows.filter((r) => {
    const due = effectiveDue(r);
    return due && ["sent", "acknowledged", "extended"].includes(r.status) && daysUntil(due) < 0;
  }).length;
  const by = groupName ?? "River Hub";

  return (
    <section id="requests" aria-labelledby="requests-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="requests-h" className="text-[18px] font-bold text-rh-ink">Information requests</h2>
        <span className="text-[12.5px] text-rh-ink3">Asked by {by} about the {riverName}</span>
      </div>
      <p className="text-[14px] text-rh-ink2">
        <strong className="font-plexmono text-rh-ink">{rows.length}</strong> request{rows.length === 1 ? "" : "s"} published
        {open > 0 && <>, <strong className="font-plexmono text-rh-ink">{open}</strong> still awaiting a reply</>}
        {overdue > 0 && <>, <strong className="font-plexmono text-rh-alarmDeep">{overdue}</strong> overdue</>}.
      </p>
      <ol className="divide-y divide-rh-line rounded-[3px] border border-rh-line bg-white">
        {rows.map((r) => <Row key={r.id} r={r} showAssets />)}
      </ol>
      <Footnote />
    </section>
  );
}
