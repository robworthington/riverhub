import Link from "next/link";
import { requireProfile, canEdit } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_STATUSES, LAYER_LABEL, OPEN_STATUSES, STATUS_LABEL, daysUntil, dueLabel, effectiveDue, fmtDate } from "@/lib/requests";
import type { InfoRequest } from "@/lib/types";
import { StatusChip } from "@/components/requests/StatusChip";

export const metadata = { title: "Requests — River Hub" };

type Filter = "open" | "overdue" | "closed" | "drafts" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "drafts", label: "Drafts" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function isOverdue(r: InfoRequest): boolean {
  const due = effectiveDue(r);
  return !!due && OPEN_STATUSES.includes(r.status) && daysUntil(due) < 0;
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === sp.f) ? (sp.f as Filter) : "open";

  const supabase = await createClient();
  const { data } = await supabase.from("info_requests").select("*").order("created_at", { ascending: false });
  const all = (data as InfoRequest[] | null) ?? [];

  const counts: Record<Filter, number> = {
    open: all.filter((r) => OPEN_STATUSES.includes(r.status)).length,
    overdue: all.filter(isOverdue).length,
    drafts: all.filter((r) => r.status === "draft").length,
    closed: all.filter((r) => CLOSED_STATUSES.includes(r.status) || r.status === "ico").length,
    all: all.length,
  };
  const rows = all.filter((r) =>
    filter === "all" ? true
    : filter === "open" ? OPEN_STATUSES.includes(r.status)
    : filter === "overdue" ? isOverdue(r)
    : filter === "drafts" ? r.status === "draft"
    : CLOSED_STATUSES.includes(r.status) || r.status === "ico",
  );
  // Open requests: soonest deadline first.
  if (filter === "open" || filter === "overdue") {
    rows.sort((a, b) => (effectiveDue(a) ?? "9999").localeCompare(effectiveDue(b) ?? "9999"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Information requests</h1>
        {canEdit(profile.role) && <Link href="/requests/new" className="btn">New request</Link>}
      </div>
      <p className="max-w-3xl text-sm text-gray-500">
        Requests your group has sent under the Environmental Information Regulations or the Freedom of
        Information Act, and what came back. Authorities have 20 working days to reply. Only requests an admin
        publishes appear on the river&rsquo;s public pages; notes always stay private to the group.
      </p>

      <nav aria-label="Filter requests" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/requests" : `/requests?f=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${
              filter === f.key ? "border-river-700 bg-river-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-river-700"
            } ${f.key === "overdue" && counts.overdue > 0 && filter !== f.key ? "border-red-300 text-red-700" : ""}`}
          >
            {f.label} <span className="ml-0.5 font-semibold">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>

      {!rows.length ? (
        <div className="card text-sm text-gray-600">
          {all.length === 0 ? (
            <>
              No requests yet. Start with a template: permits for your treatment works (so River Hub can check
              their capacity), emergency-overflow records, or pollution incidents.{" "}
              {canEdit(profile.role) && <Link href="/requests/new" className="font-medium text-river-700 hover:underline">Start a request →</Link>}
            </>
          ) : (
            <>Nothing here. Try another filter.</>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Request</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Sent</th>
                <th className="px-4 py-2">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const due = dueLabel(r);
                return (
                  <tr key={r.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/requests/${r.id}`} className="font-medium text-river-700 hover:underline">{r.title}</Link>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {LAYER_LABEL[r.layer]} · {r.law.toUpperCase()}
                        {r.route === "whatdotheyknow" ? " · WhatDoTheyKnow" : " · sent directly"}
                        {r.is_public && " · published"}
                        {r.data_loaded && " · data loaded"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.authority}</td>
                    <td className="px-4 py-2.5"><StatusChip status={r.status} label={STATUS_LABEL[r.status]} /></td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fmtDate(r.sent_on)}</td>
                    <td className={`px-4 py-2.5 whitespace-nowrap ${due?.includes("late") ? "font-semibold text-red-700" : "text-gray-700"}`}>
                      {due ?? (r.answered_on ? `Replied ${fmtDate(r.answered_on)}` : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
