import type { InfoRequestStatus } from "@/lib/types";

const TONE: Record<InfoRequestStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-sky-50 text-sky-800 border-sky-200",
  acknowledged: "bg-sky-50 text-sky-800 border-sky-200",
  extended: "bg-amber-50 text-amber-800 border-amber-200",
  answered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-emerald-50 text-emerald-800 border-emerald-200",
  refused: "bg-red-50 text-red-800 border-red-200",
  not_held: "bg-gray-100 text-gray-700 border-gray-200",
  internal_review: "bg-amber-50 text-amber-800 border-amber-200",
  ico: "bg-amber-50 text-amber-800 border-amber-200",
  withdrawn: "bg-gray-100 text-gray-500 border-gray-200",
};

export function StatusChip({ status, label }: { status: InfoRequestStatus; label: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>{label}</span>;
}
