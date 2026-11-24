"use client";

import { useActionState } from "react";
import { submitPhotoReport, type ReportState } from "@/app/(public)/r/[river]/explore/photos/report/[photoId]/actions";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/photos";

const field = "w-full rounded-[3px] border border-rh-line bg-white px-3 py-2 text-[14px] text-rh-ink focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20";

export function PhotoReportForm({ photoId, riverName }: { photoId: string; riverName: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(submitPhotoReport, {});

  if (state.ok) {
    return (
      <div role="status" className="max-w-[560px] space-y-2 rounded-[3px] border border-[#b9dcd3] bg-[#eef7f4] px-5 py-4 text-[14.5px] leading-[1.6] text-rh-ink">
        <h2 className="text-[16px] font-bold">Thank you: your report has been sent</h2>
        <p>
          {state.hidden
            ? "The photo has been taken off River Hub while it's reviewed."
            : `The ${riverName}'s admins will review it.`}{" "}
          If you left an email address, they may contact you about it.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-[560px] space-y-5">
      <input type="hidden" name="photo" value={photoId} />
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
        <label>Fax number<input name="company_fax" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[14px] font-semibold text-rh-ink">What&rsquo;s wrong with it?</legend>
        {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
          <label key={r} className="flex items-start gap-2.5 text-[14px] text-rh-ink">
            <input type="radio" name="reason" value={r} required className="mt-1 h-4 w-4 accent-brand-navy" />
            <span>
              {REPORT_REASON_LABEL[r]}
              {r === "privacy" && <span className="block text-[12.5px] text-rh-ink3">The photo comes down straight away while it&rsquo;s reviewed.</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1.5">
        <span className="block text-[14px] font-semibold text-rh-ink">
          Anything else we should know? <span className="font-normal text-rh-ink3">(optional)</span>
        </span>
        <textarea name="note" rows={4} maxLength={1000} className={field} />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-[14px] font-semibold text-rh-ink">
          Your email <span className="font-normal text-rh-ink3">(optional, only if you&rsquo;d like a reply; never published)</span>
        </span>
        <input name="email" type="email" maxLength={254} autoComplete="email" className={field} />
      </label>

      {state.error && (
        <p role="alert" className="rounded-[3px] border border-[#e8b6ae] bg-rh-alarmTint px-4 py-3 text-[13.5px] font-semibold text-rh-alarmDeep">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="rounded-[4px] bg-brand-navyDeep px-5 py-2.5 text-[14.5px] font-semibold text-white hover:bg-brand-navy disabled:opacity-60">
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
