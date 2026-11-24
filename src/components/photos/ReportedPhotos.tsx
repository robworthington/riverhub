import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/photos";
import { ReportDecision, type DecideAction } from "@/components/photos/ReportDecision";

// Open reports on river photos (migration 0110), grouped by photo, with Keep / Hide. Used on the
// members' Photos page (the river's admins) and the moderators' queue (every river).

export type ReportedPhoto = {
  id: string; caption: string; status: string; hiddenByReports: boolean; thumbUrl: string | null; riverName?: string;
  reports: { id: string; reason: ReportReason; note: string | null; email: string | null; created_at: string }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ReportedPhotos({ photos, decide }: { photos: ReportedPhoto[]; decide: DecideAction }) {
  return (
    <ul className="space-y-3">
      {photos.map((p) => (
        <li key={p.id} className="card flex flex-col gap-3 sm:flex-row">
          {p.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbUrl} alt="" className="h-24 w-32 shrink-0 rounded object-cover" />
          ) : (
            <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">No preview</div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="font-medium">{p.caption}</div>
              <div className="text-xs text-gray-500">
                {p.riverName ? `${p.riverName} · ` : ""}
                {p.status === "approved" ? "Still public" : p.hiddenByReports ? "Hidden automatically until reviewed" : "Hidden"}
                {" · "}{p.reports.length} {p.reports.length === 1 ? "report" : "reports"}
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {p.reports.map((r) => (
                <li key={r.id} className="rounded bg-gray-50 px-2.5 py-1.5">
                  <span className="font-medium">{REPORT_REASON_LABEL[r.reason]}</span>
                  <span className="text-gray-500"> · {fmt(r.created_at)}</span>
                  {r.note && <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{r.note}</p>}
                  {r.email && <a href={`mailto:${r.email}`} className="text-xs text-river-700 hover:underline">{r.email}</a>}
                </li>
              ))}
            </ul>
            <ReportDecision photoId={p.id} wasHidden={p.status !== "approved"} decide={decide} />
          </div>
        </li>
      ))}
    </ul>
  );
}
