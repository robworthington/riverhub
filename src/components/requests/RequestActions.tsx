"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addDocument, addNote, deleteRequest, markSent, setDataLoaded, setPublic, updateDetails, updateStatus,
} from "@/app/(app)/requests/actions";
import { STATUS_LABEL } from "@/lib/requests";
import type { InfoRequestLaw, InfoRequestRoute, InfoRequestStatus } from "@/lib/types";

type Req = {
  id: string; status: InfoRequestStatus; law: InfoRequestLaw; route: InfoRequestRoute; title: string; body: string;
  authority_ref: string; wdtk_url: string; notes: string; is_public: boolean; data_loaded: boolean;
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// What a member can do next with a request, depending on where it is in its life.
export function RequestActions({ request: r, wdtkSendUrl, editor, admin }: { request: Req; wdtkSendUrl: string | null; editor: boolean; admin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // send
  const [sentOn, setSentOn] = useState(today());
  const [wdtkUrl, setWdtkUrl] = useState(r.wdtk_url);
  const [ref, setRef] = useState(r.authority_ref);
  // status
  const nextStatuses: InfoRequestStatus[] = ["acknowledged", ...(r.law === "eir" ? (["extended"] as InfoRequestStatus[]) : []), "answered", "partial", "refused", "not_held", "internal_review", "ico", "withdrawn"];
  const [status, setStatus] = useState<InfoRequestStatus>("answered");
  const [statusDate, setStatusDate] = useState(today());
  // note, upload, details
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"reply" | "letter" | "attachment" | "other">("reply");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ title: r.title, body: r.body, authorityRef: r.authority_ref, wdtkUrl: r.wdtk_url, notes: r.notes });

  function run(fn: () => Promise<{ error?: string } | undefined | void>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError("Files over 25 MB can't be uploaded here."); return; }
    setUploading(true);
    setError(null);
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
    const path = `requests/${r.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await createClient().storage.from("evidence").upload(path, file);
    if (upErr) { setUploading(false); setError(upErr.message); return; }
    const res = await addDocument(r.id, { storagePath: path, fileName: file.name, kind });
    setUploading(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(r.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy: select the letter below and copy it by hand.");
    }
  }

  if (!editor && !admin) return null;
  const isDraft = r.status === "draft";
  const closed = ["answered", "partial", "refused", "not_held", "withdrawn"].includes(r.status);

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}

      {isDraft && editor && (
        <section className="card space-y-4 border-river-500">
          <h2 className="text-base font-semibold">Send it</h2>
          {wdtkSendUrl ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
              <li>
                <a href={wdtkSendUrl} target="_blank" rel="noopener noreferrer" className="btn">Open the pre-filled request on WhatDoTheyKnow ↗</a>
              </li>
              <li>Sign in there (or create an account), check the letter and send it. It&rsquo;s tagged so River Hub can find it again.</li>
              <li>Copy the address of the request page it takes you to, and paste it below.</li>
            </ol>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
              <button type="button" onClick={copyLetter} className="btn-secondary">{copied ? "Copied" : "Copy the letter"}</button>
              <span>Send it by email or through the authority&rsquo;s own form, then record it here.</span>
            </div>
          )}
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); run(() => markSent(r.id, { sentOn, wdtkUrl, authorityRef: ref })); }}
          >
            <div>
              <label htmlFor="sent-on" className="label">Sent on</label>
              <input id="sent-on" type="date" className="input" value={sentOn} max={today()} onChange={(e) => setSentOn(e.target.value)} required />
            </div>
            {r.route === "whatdotheyknow" ? (
              <div className="sm:col-span-2">
                <label htmlFor="wdtk-url" className="label">WhatDoTheyKnow link</label>
                <input id="wdtk-url" className="input" placeholder="https://www.whatdotheyknow.com/request/…" value={wdtkUrl} onChange={(e) => setWdtkUrl(e.target.value)} />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label htmlFor="their-ref" className="label">Their reference <span className="font-normal text-gray-500">(if they gave one)</span></label>
                <input id="their-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
            )}
            <div className="sm:col-span-3">
              <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : "Mark as sent"}</button>
              <span className="ml-3 text-xs text-gray-500">The reply is due 20 working days later; River Hub works out the date.</span>
            </div>
          </form>
        </section>
      )}

      {!isDraft && editor && (
        <section className="card grid gap-4 md:grid-cols-2">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => updateStatus(r.id, status, statusDate)); }}>
            <h2 className="text-sm font-semibold">Update status</h2>
            <div className="flex flex-wrap gap-2">
              <select aria-label="New status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as InfoRequestStatus)}>
                {nextStatuses.map((s) => <option key={s} value={s}>{s === "extended" ? "Extended (EIR, 40 working days)" : STATUS_LABEL[s]}</option>)}
              </select>
              <input aria-label="Date" type="date" className="input w-auto" value={statusDate} max={today()} onChange={(e) => setStatusDate(e.target.value)} />
              <button type="submit" className="btn" disabled={pending}>Save</button>
            </div>
            <p className="text-xs text-gray-500">Refused, or no reply after 20 working days? Ask for an internal review, then go to the Information Commissioner.</p>
          </form>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Add a document</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Document type" className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="reply">Reply</option>
                <option value="attachment">Attachment</option>
                <option value="letter">Our letter</option>
                <option value="other">Other</option>
              </select>
              <label className="btn-secondary cursor-pointer">
                {uploading ? "Uploading…" : "Choose file"}
                <input type="file" className="hidden" disabled={uploading} onChange={onFile} />
              </label>
            </div>
            <p className="text-xs text-gray-500">Kept privately for your group. Up to 25 MB.</p>
          </div>
        </section>
      )}

      {editor && (
        <form className="card space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => addNote(r.id, note), () => setNote("")); }}>
          <label htmlFor="note" className="text-sm font-semibold">Add to the timeline</label>
          <div className="flex gap-2">
            <input id="note" className="input" placeholder="e.g. Chased by email; they've promised a reply by Friday" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn" disabled={pending || !note.trim()}>Add</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {editor && (
          <button type="button" className="btn-secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? "Close editing" : "Edit details"}
          </button>
        )}
        {editor && closed && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={r.data_loaded} disabled={pending} onChange={(e) => run(() => setDataLoaded(r.id, e.target.checked))} />
            The reply&rsquo;s data has been loaded into River Hub
          </label>
        )}
        {admin && !isDraft && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => setPublic(r.id, !r.is_public))}>
            {r.is_public ? "Unpublish" : "Publish on the river's pages"}
          </button>
        )}
        {admin && (
          <button
            type="button"
            className="ml-auto text-sm text-red-700 hover:underline"
            disabled={pending}
            onClick={() => { if (window.confirm("Delete this request, its timeline and its documents? This can't be undone.")) run(() => deleteRequest(r.id)); }}
          >
            Delete request
          </button>
        )}
      </div>

      {editing && editor && (
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => updateDetails(r.id, details), () => setEditing(false)); }}>
          <div>
            <label htmlFor="d-title" className="label">Title</label>
            <input id="d-title" className="input" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="d-body" className="label">Letter</label>
            <textarea id="d-body" className="input font-mono text-[13px]" rows={10} value={details.body} onChange={(e) => setDetails({ ...details, body: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="d-ref" className="label">Their reference</label>
              <input id="d-ref" className="input" value={details.authorityRef} onChange={(e) => setDetails({ ...details, authorityRef: e.target.value })} />
            </div>
            <div>
              <label htmlFor="d-wdtk" className="label">WhatDoTheyKnow link</label>
              <input id="d-wdtk" className="input" value={details.wdtkUrl} onChange={(e) => setDetails({ ...details, wdtkUrl: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="d-notes" className="label">Private notes <span className="font-normal text-gray-500">(never published)</span></label>
            <textarea id="d-notes" className="input" rows={3} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} />
          </div>
          <button type="submit" className="btn" disabled={pending}>Save details</button>
        </form>
      )}
    </div>
  );
}
