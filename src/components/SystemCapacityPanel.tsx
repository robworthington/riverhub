"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  upsertSystemAssumptions,
  refreshSystemPopulationFromOns,
  type SystemAssumptionsInput,
} from "@/app/(app)/sewage-systems/actions";

export interface CapacityPanelProps {
  systemId: string;
  isAdmin: boolean;
  // current stored assumptions (defaults applied by the page)
  onsPopulation: number | null;
  onsCalculatedAt: string | null;
  onsSource: string | null;
  populationOverride: number | null;
  gLhd: number;
  lowVariationPct: number;
  highVariationPct: number;
  infiltrationM3d: number;
  tradeEffluentM3d: number;
  notes: string | null;
  // permit requirement + actual capacity from the works asset (read-only here)
  works: {
    assetId: string;
    assetName: string;
    permitDwf: number | null;
    permitFft: number | null;
    permitPe: number | null;
    actualCapacity: number | null;
    actualCapacitySource: string | null;
  } | null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function utilColour(pct: number): string {
  if (pct > 100) return "#dc2626"; // over capacity — red
  if (pct >= 80) return "#d97706"; // approaching — amber
  return "#16a34a"; // headroom — green
}

export function SystemCapacityPanel(p: CapacityPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ons, setOns] = useState<number | null>(p.onsPopulation);
  const [override, setOverride] = useState<string>(p.populationOverride?.toString() ?? "");
  const [g, setG] = useState<string>(p.gLhd.toString());
  const [low, setLow] = useState<string>(p.lowVariationPct.toString());
  const [high, setHigh] = useState<string>(p.highVariationPct.toString());
  const [inf, setInf] = useState<string>(p.infiltrationM3d.toString());
  const [trade, setTrade] = useState<string>(p.tradeEffluentM3d.toString());
  const [notes, setNotes] = useState<string>(p.notes ?? "");

  const num = (s: string, d = 0) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : d;
  };
  const overrideN = override.trim() === "" ? null : num(override);
  const effP = overrideN ?? ons;
  const gN = num(g, 140);
  const lowN = num(low);
  const highN = num(high);
  const infN = num(inf);
  const tradeN = num(trade);

  const demand =
    effP == null
      ? null
      : {
          popLow: Math.round(effP * (1 - lowN / 100)),
          popHigh: Math.round(effP * (1 + highN / 100)),
          low: round1((effP * (1 - lowN / 100) * gN) / 1000 + infN + tradeN),
          central: round1((effP * gN) / 1000 + infN + tradeN),
          high: round1((effP * (1 + highN / 100) * gN) / 1000 + infN + tradeN),
        };

  const permit = p.works?.permitDwf ?? null;
  const capacity = p.works?.actualCapacity ?? null;

  // capacity utilisation — prefer EIR-confirmed installed capacity, else the permit DWF
  const capBasis = capacity ?? permit;
  const capLabel = capacity != null ? "installed capacity" : permit != null ? "permit DWF" : null;
  const utilData =
    demand && capBasis
      ? [
          { name: "Low", pct: round1((demand.low / capBasis) * 100) },
          { name: "Central", pct: round1((demand.central / capBasis) * 100) },
          { name: "High", pct: round1((demand.high / capBasis) * 100) },
        ]
      : null;
  const centralUtil = utilData ? utilData[1].pct : null;

  // verdict
  let verdict: { tone: "red" | "amber" | "green" | "gray"; text: string } | null = null;
  if (demand) {
    if (capacity != null && demand.high > capacity) {
      verdict = { tone: "red", text: "Peak (high-end) demand exceeds installed capacity — seasonal overload likely." };
    } else if (permit != null && demand.central > permit) {
      verdict = { tone: "amber", text: "Central demand exceeds the permitted dry-weather flow." };
    } else if (permit != null && capacity != null && permit > capacity) {
      verdict = { tone: "amber", text: "Permit requires more flow than the installed capacity provides." };
    } else if (permit != null || capacity != null) {
      verdict = { tone: "green", text: "Capacity appears adequate for the estimated demand." };
    } else {
      verdict = { tone: "gray", text: "Add the permit DWF and EIR-confirmed capacity to complete the comparison." };
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    const input: SystemAssumptionsInput = {
      g_lhd: gN,
      low_variation_pct: lowN,
      high_variation_pct: highN,
      infiltration_m3d: infN,
      trade_effluent_m3d: tradeN,
      population_override: overrideN,
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    const res = await upsertSystemAssumptions(p.systemId, input);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setEditing(false);
      router.refresh();
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    setError(null);
    const res = await refreshSystemPopulationFromOns(p.systemId);
    setRefreshing(false);
    if (res.error) setError(res.error);
    else {
      setOns(res.population ?? 0);
      router.refresh();
    }
  }

  const toneClass = {
    red: "bg-red-50 text-red-800 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  } as const;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Population &amp; capacity</h2>
        {p.isAdmin && !editing && (
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs">
            Edit assumptions
          </button>
        )}
      </div>

      {/* Demand range readout */}
      {demand ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Demand — low" value={`${demand.low} m³/day`} sub={`${demand.popLow.toLocaleString()} people`} />
          <Stat label="Demand — central" value={`${demand.central} m³/day`} sub={`${(effP ?? 0).toLocaleString()} people`} highlight />
          <Stat label="Demand — high" value={`${demand.high} m³/day`} sub={`${demand.popHigh.toLocaleString()} people`} />
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No population yet. {p.isAdmin ? "Refresh from ONS or enter an override below." : "Awaiting an estimate."}
        </p>
      )}

      {/* Comparison */}
      <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 text-sm">
        <div>
          <div className="text-xs uppercase text-gray-400">Permit requirement</div>
          <div className="text-gray-800">{permit != null ? `${permit} m³/day DWF` : "—"}</div>
          {p.works?.permitFft != null && <div className="text-xs text-gray-500">FFT {p.works.permitFft} m³/day</div>}
          {p.works?.permitPe != null && <div className="text-xs text-gray-500">{p.works.permitPe.toLocaleString()} PE</div>}
        </div>
        <div>
          <div className="text-xs uppercase text-gray-400">Actual capacity</div>
          <div className="text-gray-800">{capacity != null ? `${capacity} m³/day` : "Unknown (EIR)"}</div>
          {p.works?.actualCapacitySource && <div className="text-xs text-gray-500">{p.works.actualCapacitySource}</div>}
        </div>
        <div>
          <div className="text-xs uppercase text-gray-400">Works asset</div>
          <div className="text-gray-800">{p.works ? p.works.assetName : "No treatment works linked"}</div>
        </div>
      </div>

      {verdict && (
        <div className={`rounded-md border px-3 py-2 text-sm ${toneClass[verdict.tone]}`}>{verdict.text}</div>
      )}

      {/* Capacity utilisation */}
      <div className="border-t border-gray-100 pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Capacity utilisation</h3>
          {capLabel && <span className="text-xs text-gray-400">vs {capLabel} ({capBasis} m³/day)</span>}
        </div>
        {utilData ? (
          <div className="grid items-center gap-3 sm:grid-cols-[auto_1fr]">
            <div className="rounded-md border border-gray-200 p-3 text-center">
              <div className="text-3xl font-semibold" style={{ color: utilColour(centralUtil!) }}>
                {centralUtil}%
              </div>
              <div className="text-xs text-gray-500">central demand of {capLabel}</div>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, (max: number) => Math.max(120, Math.ceil(max / 20) * 20)]} />
                  <Tooltip formatter={(v) => [`${v}%`, "Utilisation"]} />
                  <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="4 3" label={{ value: "capacity", position: "right", fontSize: 10, fill: "#dc2626" }} />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                    {utilData.map((d) => (
                      <Cell key={d.name} fill={utilColour(d.pct)} />
                    ))}
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "#374151" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Add the permit DWF or EIR-confirmed capacity to the works asset to show utilisation.
          </p>
        )}
      </div>

      {/* ONS provenance / refresh */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>
          ONS base P: {ons != null ? ons.toLocaleString() : "—"}
          {overrideN != null && <span className="text-amber-700"> (overridden to {overrideN.toLocaleString()})</span>}
          {p.onsCalculatedAt && ` · as of ${new Date(p.onsCalculatedAt).toLocaleDateString()}`}
          {p.onsSource && ` · ${p.onsSource}`}
        </span>
        {p.isAdmin && (
          <button onClick={onRefresh} className="btn-secondary text-xs" disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh from ONS"}
          </button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Per-capita G (l/head/day)" value={g} onChange={setG} hint="Central 140; design ~180" />
            <Field label="Low variation (−%)" value={low} onChange={setLow} hint="Off-mains etc." />
            <Field label="High variation (+%)" value={high} onChange={setHigh} hint="Tourism / 2nd homes" />
            <Field label="Population override" value={override} onChange={setOverride} hint="Blank = use ONS" />
            <Field label="Infiltration I (m³/day)" value={inf} onChange={setInf} hint="Optional" />
            <Field label="Trade effluent E (m³/day)" value={trade} onChange={setTrade} hint="Optional" />
          </div>
          <div>
            <label className="label">Notes (local reasoning)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onSave} className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save assumptions"}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary" disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && !editing && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-river-200 bg-river-50" : "border-gray-200"}`}>
      <div className="text-xs uppercase text-gray-400">{label}</div>
      <div className="text-base font-semibold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
