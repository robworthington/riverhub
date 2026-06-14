// Presentational panel for WINEP (Water Industry National Environment Programme) actions.
// Used on the members asset page and the public portal. Pure server component — no interactivity.
// See WINEP-DATA-RESEARCH.md. WINEP actions are the EA-issued, legally-binding improvements a water
// company must complete in a price-review cycle (PR24/AMP8 2025–30; PR19/AMP7 2020–25, the baseline).

export interface WinepActionRow {
  id: string;
  cycle: string; // PR24 | PR19
  driver_code: string | null;
  driver_label: string | null;
  driver_obligation: string | null;
  action_name: string | null;
  action_description: string | null;
  completion_date: string | null;
  overdue?: boolean;
  link_kind?: string | null; // asset | works | waterbody
  proposed_permit_dwf?: string | null;
  proposed_bod?: string | null;
  proposed_nh3?: string | null;
  proposed_p?: string | null;
  bathing_water?: string | null;
  shellfish_water?: string | null;
  wb_name?: string | null;
}

const isNum = (v: string | null | undefined) =>
  v != null && v.trim() !== "" && v.trim().toLowerCase() !== "n/a";

const LINK_LABEL: Record<string, string> = {
  asset: "this outlet",
  works: "this works",
  waterbody: "this water body",
};

function fmtDate(d: string | null): string {
  if (!d) return "no date";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function ActionRow({ a }: { a: WinepActionRow }) {
  const permits: string[] = [];
  if (isNum(a.proposed_permit_dwf)) permits.push(`DWF → ${a.proposed_permit_dwf}`);
  if (isNum(a.proposed_bod)) permits.push(`BOD → ${a.proposed_bod}`);
  if (isNum(a.proposed_nh3)) permits.push(`NH₃ → ${a.proposed_nh3}`);
  if (isNum(a.proposed_p)) permits.push(`P → ${a.proposed_p}`);
  const receptors = [a.bathing_water, a.shellfish_water].filter(Boolean) as string[];

  return (
    <li className="border-t border-gray-100 py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            a.cycle === "PR24" ? "bg-river-100 text-river-800" : "bg-gray-100 text-gray-500"
          }`}
        >
          {a.cycle === "PR24" ? "PR24 / AMP8" : "PR19 / AMP7"}
        </span>
        {a.driver_code ? (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
            {a.driver_code}
          </span>
        ) : null}
        {a.link_kind && LINK_LABEL[a.link_kind] ? (
          <span className="text-[10px] text-gray-400">links to {LINK_LABEL[a.link_kind]}</span>
        ) : null}
        <span
          className={`ml-auto text-xs font-medium ${
            a.overdue ? "text-red-600" : "text-gray-600"
          }`}
        >
          {a.overdue ? "⚠ deadline passed: " : "due "}
          {fmtDate(a.completion_date)}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-gray-800">{a.action_name ?? "—"}</p>
      {a.driver_label ? (
        <p className="mt-0.5 text-xs text-gray-500">
          {a.driver_obligation ? <span className="font-medium">{a.driver_obligation}: </span> : null}
          {a.driver_label.length > 180 ? a.driver_label.slice(0, 180) + "…" : a.driver_label}
        </p>
      ) : null}
      {(permits.length > 0 || receptors.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {permits.map((p) => (
            <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
              new permit limit {p}
            </span>
          ))}
          {receptors.map((r) => (
            <span key={r} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
              {r}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export function WinepPanel({
  actions,
  heading = "Planned improvements (WINEP)",
  emptyText = "No WINEP actions are linked to this asset.",
}: {
  actions: WinepActionRow[];
  heading?: string;
  emptyText?: string;
}) {
  const pr24 = actions.filter((a) => a.cycle === "PR24");
  const pr19 = actions.filter((a) => a.cycle !== "PR24");

  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{heading}</h2>
        <span className="text-xs text-gray-400">EA Water Industry National Environment Programme</span>
      </div>
      {actions.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          {pr24.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Current cycle — required by 2030
              </p>
              <ul>
                {pr24.map((a) => (
                  <ActionRow key={a.id} a={a} />
                ))}
              </ul>
            </div>
          )}
          {pr19.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Previous cycle (AMP7, 2020–25) — delivery baseline
              </p>
              <ul>
                {pr19.map((a) => (
                  <ActionRow key={a.id} a={a} />
                ))}
              </ul>
            </div>
          )}
          <p className="pt-1 text-[11px] leading-snug text-gray-400">
            WINEP locations are EA-published to ~1&nbsp;km; actions are matched to this asset by works
            name and water body, so treat them as applying to the works/water body. Per-action
            delivery is not openly published — overdue flags are against the legal deadline only.
          </p>
        </>
      )}
    </div>
  );
}
