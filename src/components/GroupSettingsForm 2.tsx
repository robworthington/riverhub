"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGroup } from "@/app/(app)/admin/group/actions";

type G = { name: string; logoUrl: string; websiteUrl: string; donateUrl: string; resultsNeedApproval: boolean };

export function GroupSettingsForm({ group, canComms, canSettings }: { group: G; canComms: boolean; canSettings: boolean }) {
  const router = useRouter();
  const [g, setG] = useState<G>(group);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const set = (k: keyof G) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setG((cur) => ({ ...cur, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveGroup(g);
    setBusy(false);
    setMsg(res);
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={!canComms || busy} className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700">Public profile</legend>
        {!canComms && <p className="text-xs text-gray-500">Needs the comms task.</p>}
        <div>
          <label className="label" htmlFor="g-name">Group name</label>
          <input id="g-name" className="input w-full" required value={g.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="g-web">Website</label>
          <input id="g-web" className="input w-full" inputMode="url" placeholder="https://" value={g.websiteUrl} onChange={set("websiteUrl")} />
        </div>
        <div>
          <label className="label" htmlFor="g-donate">Donate link</label>
          <input id="g-donate" className="input w-full" inputMode="url" placeholder="https://" value={g.donateUrl} onChange={set("donateUrl")} />
        </div>
        <div>
          <label className="label" htmlFor="g-logo">Logo (web address of an image)</label>
          <input id="g-logo" className="input w-full" inputMode="url" placeholder="https://" value={g.logoUrl} onChange={set("logoUrl")} />
        </div>
      </fieldset>

      <fieldset disabled={!canSettings || busy} className="space-y-2">
        <legend className="text-sm font-semibold text-gray-700">Results</legend>
        {!canSettings && <p className="text-xs text-gray-500">Needs the settings task.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={g.resultsNeedApproval} onChange={set("resultsNeedApproval")} />
          <span>
            Volunteers&rsquo; results wait for approval before they&rsquo;re published
            <span className="block text-xs text-gray-500">
              Someone with the sampling task approves them. Approval is being built: until then results are published as they
              are entered, whatever this says.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn" disabled={busy || (!canComms && !canSettings)}>{busy ? "Saving…" : "Save"}</button>
        {msg?.ok && <span className="text-sm text-green-600">Saved.</span>}
        {msg?.error && <span className="text-sm text-red-600">{msg.error}</span>}
      </div>
    </form>
  );
}
