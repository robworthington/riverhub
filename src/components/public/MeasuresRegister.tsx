"use client";

import { useState } from "react";
import { actionTypeFromDriver, ACTION_TYPE_META, type WinepActionType } from "@/lib/winep";

export type MeasureRow = {
  id: string; action_ref: string | null; action_component: string | null; cycle: string | null;
  driver_code: string | null; driver_label: string | null; driver_obligation: string | null;
  action_name: string | null; action_description: string | null; completion_date: string | null; complete: boolean;
  wb_name: string | null; attached_name: string | null; attached_kind: string; attached_count: number;
};

function ampYear(iso: string | null): { label: string; y: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, y };
}
function attachedLabel(m: MeasureRow): { text: string; muted: boolean } {
  if (m.attached_count > 1) return { text: `${m.attached_count} overflows`, muted: false };
  if ((m.attached_kind === "asset" || m.attached_kind === "works") && m.attached_name) return { text: m.attached_name, muted: false };
  if (m.attached_kind === "waterbody" && m.wb_name) return { text: m.wb_name, muted: true };
  return { text: "Water body only", muted: true };
}
// A prose requirement: this dataset has no per-measure description, so use the type-derived phrase
// (the driver_obligation field is only the type code). The site (action_name) is shown as context.
function requiresText(m: MeasureRow, t: WinepActionType): string {
  const desc = (m.action_description || "").trim();
  return desc.length ? desc : ACTION_TYPE_META[t].requires;
}

type TypeFilter = "all" | WinepActionType;
type TimeFilter = "all" | "active" | "complete" | "soon" | "late";

export function MeasuresRegister({ rows }: { rows: MeasureRow[] }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [time, setTime] = useState<TimeFilter>("all");

  const typed = rows.map((m) => ({ m, t: actionTypeFromDriver(m.driver_code), a: ampYear(m.completion_date) }));
  const shown = typed.filter(({ m, t, a }) => {
    if (type !== "all" && t !== type) return false;
    if (time === "complete" && !m.complete) return false;
    if (time === "active" && m.complete) return false;
    if (time === "soon" && !(a && !m.complete && a.y <= 2027)) return false;
    if (time === "late" && !(a && a.y >= 2029)) return false;
    return true;
  });

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All types" },
    { key: "improvement", label: "Improvement" },
    { key: "investigation", label: "Investigation" },
    { key: "monitoring", label: "Monitoring" },
    { key: "no-deterioration", label: "No deterioration" },
  ];
  const timeChips: { key: TimeFilter; label: string }[] = [
    { key: "all", label: "Any time" },
    { key: "active", label: "Active" },
    { key: "complete", label: "Complete" },
    { key: "soon", label: "Due by 2027" },
    { key: "late", label: "Due 2029+" },
  ];

  const chipCls = (active: boolean) =>
    `rounded-[2px] border px-2.5 py-1 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-rh-teal ${
      active ? "border-rh-ink bg-rh-ink text-white" : "border-rh-line bg-rh-card text-rh-ink2 hover:bg-rh-rowHover"
    }`;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">{typeChips.map((c) => <button key={c.key} onClick={() => setType(c.key)} className={chipCls(type === c.key)}>{c.label}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{timeChips.map((c) => <button key={c.key} onClick={() => setTime(c.key)} className={chipCls(time === c.key)}>{c.label}</button>)}</div>
      </div>

      <div className="overflow-x-auto rounded-[3px] border border-rh-line bg-rh-card">
        <table className="min-w-[860px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-rh-lineSoft bg-rh-cardAlt text-[10.5px] font-semibold uppercase tracking-[.07em] text-rh-label">
              <th className="px-[18px] py-2 text-left font-semibold">Reference</th>
              <th className="px-3 py-2 text-left font-semibold">Driver</th>
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-left font-semibold">What it requires</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-[18px] py-2 text-left font-semibold">Attached to</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ m, t, a }) => {
              const meta = ACTION_TYPE_META[t];
              const att = attachedLabel(m);
              return (
                <tr key={m.id} className="border-b border-rh-rowDiv align-top hover:bg-rh-rowHover">
                  <td className="px-[18px] py-2.5 font-plexmono text-[12px] text-rh-ink2">{m.action_ref ?? "—"}{m.action_component ? ` · ${m.action_component}` : ""}</td>
                  <td className="px-3 py-2.5">{m.driver_code && <span className="inline-flex rounded-[2px] border border-rh-chipTealBorder bg-rh-chipTealBg px-2 py-0.5 font-plexmono text-[11px] font-semibold text-rh-tealDeep">{m.driver_code}</span>}</td>
                  <td className="px-3 py-2.5"><span className={`inline-flex rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>{meta.label}</span></td>
                  <td className="px-3 py-2.5 text-rh-ink">
                    <div className="font-medium">{requiresText(m, t)}</div>
                    {m.action_name && <div className="text-[11.5px] text-rh-ink3">{m.action_name}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-plexmono text-[12.5px]">
                    {m.complete
                      ? <span className="font-semibold text-rh-teal">Complete{a ? ` ${a.label}` : ""}</span>
                      : a ? <span className={a.y >= 2029 ? "font-semibold text-rh-alarm" : "text-rh-amber"}>Due {a.label}</span>
                      : <span className="text-rh-quiet">—</span>}
                  </td>
                  <td className={`px-[18px] py-2.5 ${att.muted ? "text-rh-ink3" : "text-rh-ink2"}`}>{att.text}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={6} className="px-[18px] py-8 text-center text-rh-ink3">No measures match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-rh-ink3">{shown.length} of {rows.length} measures shown. A measure whose completion date has passed is shown as <strong>Complete</strong>; the water company&apos;s actual delivery against it is reported to the regulator but not published here.</p>
    </div>
  );
}
