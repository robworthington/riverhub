"use client";

import { useActionState } from "react";
import { submitAdoption, type SubmitState } from "@/app/(public)/r/[river]/explore/adopt/actions";
import { GROUP_KIND_LABEL, type GroupKind } from "@/lib/adoption";

const field = "w-full rounded-[3px] border border-rh-line bg-white px-3 py-2 text-[14px] text-rh-ink focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20";
const label = "block text-[13.5px] font-semibold text-rh-ink";
const hint = "mt-0.5 block text-[12.5px] font-normal text-rh-ink3";

function Field({ name, title, help, required, type = "text", autoComplete, maxLength }: {
  name: string; title: string; help?: string; required?: boolean; type?: string; autoComplete?: string; maxLength?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={label}>
        {title}{required ? "" : <span className="font-normal text-rh-ink3"> (optional)</span>}
        {help && <span className={hint}>{help}</span>}
      </span>
      <input name={name} type={type} required={required} autoComplete={autoComplete} maxLength={maxLength} className={field} />
    </label>
  );
}

export function AdoptForm({ riverSlug, riverName }: { riverSlug: string; riverName: string }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitAdoption, {});

  if (state.ok) {
    return (
      <div role="status" className="max-w-[640px] space-y-2 rounded-[3px] border border-[#b9dcd3] bg-[#eef7f4] px-6 py-5 text-[14.5px] leading-[1.6] text-rh-ink">
        <h2 className="text-[17px] font-bold">Thank you: your request has been sent</h2>
        <p>
          A River Hub moderator will review it, usually within a week, and email you either way. If it&rsquo;s approved,
          the {riverName}&rsquo;s pages will name your group and you&rsquo;ll get an invitation to set up your account as
          its first admin.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-[640px] space-y-6" noValidate={false}>
      <input type="hidden" name="river" value={riverSlug} />
      {/* honeypot: hidden from people and screen readers */}
      <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
        <label>Fax number<input name="company_fax" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-[16px] font-bold text-rh-ink">Your group</legend>
        <Field name="group_name" title="Group name" help="As it should appear on the river's pages" required maxLength={120} autoComplete="organization" />
        <label className="block space-y-1.5">
          <span className={label}>What kind of group are you?</span>
          <select name="group_kind" required defaultValue="" className={field}>
            <option value="" disabled>Choose one</option>
            {(Object.keys(GROUP_KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <Field name="charity_number" title="Charity or company number" maxLength={40} />
        <Field name="website" title="Website or social media page" help="Helps us confirm the group is real" maxLength={300} autoComplete="url" />
        <label className="block space-y-1.5">
          <span className={label}>
            About your group and its work on the {riverName}
            <span className={hint}>What you do on or for the river now, and how you&rsquo;d use River Hub. A few sentences is plenty.</span>
          </span>
          <textarea name="about" required minLength={30} maxLength={3000} rows={6} className={field} />
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-[16px] font-bold text-rh-ink">You</legend>
        <p className="-mt-2 text-[13px] text-rh-ink3">If approved, you&rsquo;ll become the river&rsquo;s first admin and can invite others.</p>
        <Field name="contact_name" title="Your name" required maxLength={120} autoComplete="name" />
        <Field name="contact_role" title="Your role in the group" help="For example chair, secretary or volunteer coordinator" required maxLength={120} />
        <Field name="email" title="Email" help="We'll send your invitation here" type="email" required maxLength={254} autoComplete="email" />
        <Field name="phone" title="Phone" type="tel" maxLength={40} autoComplete="tel" />
        <Field name="how_heard" title="How did you hear about River Hub?" maxLength={300} />
      </fieldset>

      <fieldset className="space-y-3 rounded-[3px] border border-rh-line bg-rh-cardAlt px-4 py-4">
        <legend className="sr-only">Confirmations</legend>
        {[
          ["authorised", `I'm asking on behalf of the group, and it agrees to look after the ${riverName} on River Hub.`],
          ["accuracy", "We'll keep what we add accurate and fair, and follow River Hub's guidance on describing overflows and incidents."],
          ["privacy", "River Hub may store these details to review the request and contact me. They won't be published."],
        ].map(([name, text]) => (
          <label key={name} className="flex items-start gap-2.5 text-[13.5px] leading-[1.5] text-rh-ink">
            <input type="checkbox" name={name} required className="mt-1 h-4 w-4 shrink-0 accent-brand-navy" />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-[3px] border border-[#e8b6ae] bg-rh-alarmTint px-4 py-3 text-[13.5px] font-semibold text-rh-alarmDeep">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded-[4px] bg-brand-navyDeep px-5 py-2.5 text-[14.5px] font-semibold text-white hover:bg-brand-navy disabled:opacity-60">
        {pending ? "Sending…" : `Ask to adopt the ${riverName}`}
      </button>
    </form>
  );
}
