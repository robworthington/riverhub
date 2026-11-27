"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGroup } from "@/app/(app)/admin/group/actions";

type G = { name: string; logoUrl: string; websiteUrl: string; donateUrl: string; resultsNeedApproval: boolean; publishResults: boolean; news: string };

export function GroupSettingsForm({ group, canComms, canSettings, slug, riverSlug }: { group: G; canComms: boolean; canSettings: boolean; slug?: string; riverSlug?: string | null }) {
  const router = useRouter();
  const [g, setG] = useState<G>(group);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const set = (k: keyof G) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setG((cur) => {
      const next = { ...cur, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value };
      // publishing needs approval (migration 0132): switching approval off unpublishes
      if (k === "resultsNeedApproval" && !next.resultsNeedApproval) next.publishResults = false;
      return next;
    });

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
          <label className="label" htmlFor="g-news">News line</label>
          <input id="g-news" className="input w-full" maxLength={200} value={g.news} onChange={set("news")}
            placeholder="Next sampling day Sat 6 Dec, meet at Totnes Steamer Quay, 10am" />
          <p className="mt-1 text-xs text-gray-500">
            Shown beside your group&rsquo;s name at the top of your rivers&rsquo; public pages, with the date you last changed it.
            Leave it empty to show nothing. {g.news.length}/200
          </p>
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
              Someone with the sampling task approves them on the Results to review page. Only approved results count in
              Analysis, on the maps and on the public pages.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={g.publishResults} disabled={!g.resultsNeedApproval} onChange={set("publishResults")} />
          <span>
            Publish our testing on River Hub
            <span className="block text-xs text-gray-500">
              {g.resultsNeedApproval ? "" : "Switch approval on first. "}
              Shows your sampling sites, approved results, the method and each site&rsquo;s bathing-water class on the river&rsquo;s
              public pages, credited to your group and offered under CC BY 4.0 (anyone may reuse them with credit). Never shown:
              who collected a sample, notes, chain-of-custody files, land ownership or access details. Sites on private land, or
              needing permission to reach, show a location rounded to about 100 m.
              {g.publishResults && riverSlug && <> <a className="text-river-700 hover:underline" href={`/r/${riverSlug}/explore/health/volunteer`}>See the public page</a>.</>}
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
