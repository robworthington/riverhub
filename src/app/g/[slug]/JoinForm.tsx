"use client";

import { useActionState } from "react";
import { submitJoinRequest, type JoinState } from "./actions";

export function JoinForm({ slug, groupName }: { slug: string; groupName: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(submitJoinRequest, {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-[6px] border border-rh-line bg-rh-cardAlt px-4 py-3 text-[15px]">
        Thanks. {groupName} will be in touch by email. If they invite you, you&rsquo;ll get a link to set up your account.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="group" value={slug} />
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label>Fax <input name="company_fax" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div>
        <label className="label" htmlFor="j-name">Your name</label>
        <input id="j-name" name="name" required minLength={2} maxLength={120} className="input w-full" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="j-email">Email</label>
        <input id="j-email" name="email" type="email" required maxLength={254} className="input w-full" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="j-msg">Anything you&rsquo;d like them to know (optional)</label>
        <textarea id="j-msg" name="message" rows={4} maxLength={2000} className="input w-full"
          placeholder="Where you live or swim, what you'd like to help with, any experience" />
      </div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" name="privacy" className="mt-1" required />
        <span>{groupName} may use my name and email to reply to me. River Hub keeps this request for up to a year.</span>
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" className="btn" disabled={pending}>{pending ? "Sending…" : "Ask to join"}</button>
    </form>
  );
}
