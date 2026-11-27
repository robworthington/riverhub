// Badge for a result's review status (migration 0130). Approved results show nothing.
export function ResultStatus({ status }: { status?: string | null }) {
  if (!status || status === "approved") return null;
  const cls = status === "pending" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{status === "pending" ? "Waiting for review" : "Rejected"}</span>;
}
