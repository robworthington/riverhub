"use client";

import { useMemo, useState, useTransition } from "react";
import { createRequest } from "@/app/(app)/requests/actions";
import { AUTHORITIES, LAYER_LABEL, TEMPLATES, authorityBySlug, companyAuthority, templateByKey } from "@/lib/requests";
import { overflowLabel } from "@/lib/overflowNames";
import type { InfoRequestLaw, InfoRequestLayer, InfoRequestRoute } from "@/lib/types";

type AssetOption = { id: string; name: string; type: string | null };

// New request: template → authority → overflows → letter. The letter is regenerated from the template
// while the member hasn't edited it; once they type in it, their text is kept.
export function RequestForm({
  river, company, assets, initialTemplate, initialAssetId,
}: {
  river: string;
  company: string | null;
  assets: AssetOption[];
  initialTemplate: string | null;
  initialAssetId: string | null;
}) {
  const companyAuth = companyAuthority(company);
  const [templateKey, setTemplateKey] = useState<string>(templateByKey(initialTemplate)?.key ?? "");
  const tpl = templateByKey(templateKey);
  const defaultAuthority = (key: string) => {
    const t = templateByKey(key);
    if (!t) return "";
    return t.to === "company" ? companyAuth?.slug ?? "" : t.to;
  };
  const [authoritySlug, setAuthoritySlug] = useState<string>(defaultAuthority(templateKey));
  const [customAuthority, setCustomAuthority] = useState("");
  const [otherChosen, setOtherChosen] = useState(false);
  const [law, setLaw] = useState<InfoRequestLaw>("eir");
  const [route, setRoute] = useState<InfoRequestRoute>("whatdotheyknow");
  const [layer, setLayer] = useState<InfoRequestLayer>(tpl?.layer ?? "other");
  const [assetIds, setAssetIds] = useState<string[]>(initialAssetId && assets.some((a) => a.id === initialAssetId) ? [initialAssetId] : []);
  const [assetFilter, setAssetFilter] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [letterEdited, setLetterEdited] = useState(false);
  const [title, setTitle] = useState("");
  const [letter, setLetter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const assetNames = useMemo(
    () => assets.filter((a) => assetIds.includes(a.id)).map((a) => overflowLabel(a.name, a.type)),
    [assets, assetIds],
  );
  const ctx = { river, company: company ?? "the water company", assets: assetNames };
  const shownTitle = titleEdited || !tpl ? title : tpl.title(ctx);
  const shownLetter = letterEdited || !tpl ? letter : tpl.letter(ctx);

  const authority = authorityBySlug(authoritySlug);
  const authorityName = authority?.name ?? customAuthority.trim();

  function pickTemplate(key: string) {
    setTemplateKey(key);
    const t = templateByKey(key);
    if (t) {
      setLayer(t.layer);
      setAuthoritySlug(defaultAuthority(key));
      setOtherChosen(false);
      setLaw("eir");
    }
    setTitleEdited(false);
    setLetterEdited(false);
  }

  function pickAuthority(slug: string) {
    setAuthoritySlug(slug);
    setOtherChosen(slug === "");
    const a = authorityBySlug(slug);
    if (a) setLaw(a.kind === "water_company" ? "eir" : law);
    if (!a) setRoute("direct"); // an authority we don't have a WhatDoTheyKnow page for
  }

  const shownAssets = assets.filter((a) => {
    const q = assetFilter.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || overflowLabel(a.name, a.type).toLowerCase().includes(q);
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createRequest({
        authoritySlug: authority ? authority.slug : null,
        authority: authorityName,
        law,
        route: authority ? route : "direct",
        template: tpl?.key ?? null,
        layer,
        title: shownTitle,
        body: shownLetter,
        assetIds,
      });
      if (res?.error) setError(res.error);
    });
  }

  const waterCompanyChosen = authority?.kind === "water_company";

  return (
    <form onSubmit={submit} className="card space-y-5">
      <fieldset className="space-y-2">
        <legend className="label">Start from</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <label key={t.key} className={`flex cursor-pointer gap-2 rounded-md border p-3 text-sm ${templateKey === t.key ? "border-river-500 bg-river-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" name="template" value={t.key} checked={templateKey === t.key} onChange={() => pickTemplate(t.key)} className="mt-0.5" />
              <span>
                <span className="font-medium text-gray-900">{t.label}</span>
                <span className="block text-xs text-gray-500">To {t.to === "company" ? company ?? "the water company" : authorityBySlug(t.to)?.name}</span>
              </span>
            </label>
          ))}
          <label className={`flex cursor-pointer gap-2 rounded-md border p-3 text-sm ${templateKey === "" ? "border-river-500 bg-river-50" : "border-gray-200 hover:border-gray-300"}`}>
            <input type="radio" name="template" value="" checked={templateKey === ""} onChange={() => pickTemplate("")} className="mt-0.5" />
            <span className="font-medium text-gray-900">Blank request</span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="authority" className="label">To</label>
          <select id="authority" className="input" value={authority ? authority.slug : otherChosen ? "other" : ""} onChange={(e) => pickAuthority(e.target.value === "other" ? "" : e.target.value)}>
            <option value="" disabled>Choose…</option>
            <optgroup label="Regulators">
              {AUTHORITIES.filter((a) => a.kind === "regulator").map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </optgroup>
            <optgroup label="Water companies">
              {AUTHORITIES.filter((a) => a.kind === "water_company").map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </optgroup>
            <option value="other">Someone else…</option>
          </select>
          {!authority && otherChosen && (
            <input aria-label="Authority name" className="input mt-2" placeholder="e.g. Devon County Council" value={customAuthority} onChange={(e) => setCustomAuthority(e.target.value)} />
          )}
        </div>
        <div>
          <label htmlFor="law" className="label">Under</label>
          <select id="law" className="input" value={law} onChange={(e) => setLaw(e.target.value as InfoRequestLaw)} disabled={waterCompanyChosen}>
            <option value="eir">Environmental Information Regulations</option>
            <option value="foi">Freedom of Information Act</option>
          </select>
          {waterCompanyChosen && <p className="mt-1 text-xs text-gray-500">Water companies only have to answer EIR requests, so ask for environmental information.</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="layer" className="label">What it should fill in</label>
          <select id="layer" className="input" value={layer} onChange={(e) => setLayer(e.target.value as InfoRequestLayer)}>
            {(Object.keys(LAYER_LABEL) as InfoRequestLayer[]).map((k) => <option key={k} value={k}>{LAYER_LABEL[k]}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="label">How you&rsquo;ll send it</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="route" checked={route === "whatdotheyknow"} onChange={() => setRoute("whatdotheyknow")} disabled={!authority} />
            Through WhatDoTheyKnow (public)
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="route" checked={route === "direct" || !authority} onChange={() => setRoute("direct")} />
            Directly, by email or their own form
          </label>
        </fieldset>
      </div>

      {assets.length > 0 && (
        <fieldset>
          <legend className="label">About these overflows or works <span className="font-normal text-gray-500">(optional)</span></legend>
          <input aria-label="Filter overflows" className="input mb-2" placeholder="Filter by name…" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)} />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 text-sm">
            {shownAssets.map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={assetIds.includes(a.id)}
                  onChange={(e) => setAssetIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                />
                {overflowLabel(a.name, a.type)}
              </label>
            ))}
            {shownAssets.length === 0 && <p className="text-gray-500">No match.</p>}
          </div>
          <p className="mt-1 text-xs text-gray-500">{assetIds.length} selected. Templates list them in the letter.</p>
        </fieldset>
      )}

      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" className="input" value={shownTitle} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} required />
      </div>
      <div>
        <label htmlFor="letter" className="label">Letter</label>
        <textarea id="letter" className="input font-mono text-[13px]" rows={14} value={shownLetter} onChange={(e) => { setLetter(e.target.value); setLetterEdited(true); }} />
        <p className="mt-1 text-xs text-gray-500">
          {route === "whatdotheyknow" && authority
            ? "WhatDoTheyKnow adds the greeting and sign-off. Don't include your address or phone number: everything there is public."
            : "Add your greeting, name and contact details when you send it."}
        </p>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn" disabled={pending || !authorityName}>{pending ? "Saving…" : "Save as draft"}</button>
        <span className="text-xs text-gray-500">Next: send it, then record the date so River Hub can track the deadline.</span>
      </div>
    </form>
  );
}
