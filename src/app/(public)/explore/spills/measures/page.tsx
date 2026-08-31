import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { INSTANCE } from "@/lib/instance";
import { actionTypeFromDriver, ACTION_TYPE_META } from "@/lib/winep";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Measures on record — ${INSTANCE.portalName}`,
  description: `The legally binding WINEP measures on record against overflows in the ${INSTANCE.riverName} catchment — with the driver, the type, the due date, and what each is attached to.`,
};

type MeasureRow = {
  id: string; action_ref: string | null; action_component: string | null; cycle: string | null;
  driver_code: string | null; driver_label: string | null; driver_obligation: string | null;
  action_name: string | null; completion_date: string | null; overdue: boolean;
  wb_name: string | null; attached_name: string | null; attached_kind: string; attached_count: number;
};

// Completion date → AMP water-year label (Apr–Mar), e.g. "2027-28".
function ampYear(iso: string | null): { label: string; y: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, y };
}

function attachedLabel(m: MeasureRow): { text: string; muted: boolean } {
  if (m.attached_count > 1) return { text: `${m.attached_count} overflows`, muted: false };
  if (m.attached_kind === "asset" && m.attached_name) return { text: m.attached_name, muted: false };
  if (m.attached_kind === "works" && m.attached_name) return { text: m.attached_name, muted: false };
  if (m.attached_kind === "waterbody" && m.wb_name) return { text: m.wb_name, muted: true };
  return { text: "Water body only", muted: true };
}

export default async function MeasuresPage() {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("public_spills_measures" as never, {} as never);
  const rows = (data ?? []) as unknown as MeasureRow[];

  const total = rows.length;
  const improvements = rows.filter((m) => actionTypeFromDriver(m.driver_code) === "improvement").length;
  const dueFinal = rows.filter((m) => { const a = ampYear(m.completion_date); return a && a.y >= 2029; }).length;
  const noAsset = rows.filter((m) => (m.attached_kind === "waterbody" || m.attached_kind === "none") && m.attached_count === 0).length;

  const cards = [
    { value: total, label: "Measures in this catchment", sub: "WINEP, current programme" },
    { value: improvements, label: "Are physical improvements", sub: "the rest investigate or monitor" },
    { value: dueFinal, label: "Due in the final year or later", sub: "2029-30 or beyond" },
    { value: noAsset, label: "Attach to no identified asset", sub: "water-body level only" },
  ];

  return (
    <div className="space-y-7 py-2">
      <div>
        <h1 className="text-[34px] font-bold tracking-[-0.025em] text-rh-ink">Measures on record</h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-rh-ink2">The legally binding measures the water company must deliver in this catchment — and what to watch.</p>
      </div>

      {/* legally-binding hero */}
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[26px] py-6">
        <p className="text-[17px] font-bold text-rh-ink">These measures are legally binding. Each one is a dated, site-specific requirement the company must deliver.</p>
        <p className="mt-3 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          The Water Industry National Environment Programme is how the Environment Agency turns statutory duties into named obligations at named sites, with a completion date attached. Where a measure requires a physical upgrade, the Agency writes the result into the site&apos;s environmental permit — and from that point the requirement is criminally enforceable. Delivery is reported annually and scored, and 100% is the only green rating.
        </p>
        <p className="mt-2 max-w-[820px] text-[13.5px] leading-[1.55] text-rh-ink2">
          So read a due date here as a commitment with legal force behind it. What to watch is <strong>slippage</strong>: a measure can be re-dated or re-scoped, and until the permit is varied the obligation on the ground has not changed.
        </p>
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

      {/* register */}
      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <table className="min-w-[820px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
              <th className="px-[18px] py-2 text-left font-semibold">Reference</th>
              <th className="px-3 py-2 text-left font-semibold">Driver</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">Measure</th>
              <th className="px-3 py-2 text-left font-semibold">Due</th>
              <th className="px-[18px] py-2 text-left font-semibold">Attached to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const t = ACTION_TYPE_META[actionTypeFromDriver(m.driver_code)];
              const a = ampYear(m.completion_date);
              const att = attachedLabel(m);
              return (
                <tr key={m.id} className="border-b border-rh-rowDiv align-top hover:bg-rh-rowHover">
                  <td className="px-[18px] py-2.5 font-plexmono text-[12px] text-rh-ink2">{m.action_ref ?? "—"}{m.action_component ? ` · ${m.action_component}` : ""}</td>
                  <td className="px-3 py-2.5">
                    {m.driver_code && <span className="inline-flex rounded-[2px] border border-[#b9d9de] bg-[#eef7f9] px-2 py-0.5 font-plexmono text-[11px] font-semibold text-rh-tealDeep">{m.driver_code}</span>}
                  </td>
                  <td className="px-3 py-2.5"><span className={`inline-flex rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold ${t.className}`}>{t.label}</span></td>
                  <td className="px-3 py-2.5 text-rh-ink">{m.action_name ?? m.driver_label ?? "—"}</td>
                  <td className="px-3 py-2.5 font-plexmono text-[12.5px]">
                    {a ? <span className={a.y >= 2029 ? "font-semibold text-rh-alarm" : "text-rh-amber"}>{a.label}</span> : <span className="text-rh-quiet">—</span>}
                    {m.overdue && <span className="ml-1 text-[10px] font-semibold text-rh-alarm">overdue</span>}
                  </td>
                  <td className={`px-[18px] py-2.5 ${att.muted ? "text-rh-ink3" : "text-rh-ink2"}`}>{att.text}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-[18px] py-8 text-center text-rh-ink3">No measures on record for this catchment yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="max-w-[820px] text-[12px] text-rh-ink3">
        Type is derived from the driver code: <strong>INV</strong> is an investigation, <strong>MON</strong> is monitoring, <strong>IMP</strong> is a physical improvement. Nationally fewer than one measure in four is a physical improvement, investigations outnumber improvements roughly 2.5 : 1, and about 27.5% of the programme falls due in its final year — against the Agency&apos;s own guidance not to back-load.
      </p>

      {/* two closing panels */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-[#7d8a8c] bg-rh-cardAlt px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">There is no public change log</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">
            The live WINEP spreadsheet is internal, and there is no versioned public comparison or published reasons when a measure is re-dated or dropped. The only way to hold slippage to account is to archive every annual release and diff it yourself.
          </p>
        </div>
        <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-amber bg-rh-card px-[22px] py-5">
          <h3 className="text-[15px] font-bold text-rh-ink">The 2027 pressure point</h3>
          <p className="mt-2 text-[13px] leading-[1.55] text-rh-ink2">
            Most investigations must complete by 30 April 2027 to feed the 2030–35 programme. That date — not 2030 — is the one to hold: an investigation that slips past it cannot shape the next round of funded schemes.
          </p>
        </div>
      </div>
    </div>
  );
}
