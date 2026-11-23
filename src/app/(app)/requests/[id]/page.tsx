import Link from "next/link";
import { notFound } from "next/navigation";
import { canEdit, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { overflowLabel } from "@/lib/overflowNames";
import { LAW_LABEL, LAYER_LABEL, STATUS_LABEL, dueLabel, fmtDate, wdtkNewRequestUrl } from "@/lib/requests";
import type { InfoRequest, InfoRequestDocument, InfoRequestEvent } from "@/lib/types";
import { StatusChip } from "@/components/requests/StatusChip";
import { RequestActions } from "@/components/requests/RequestActions";

export const metadata = { title: "Request — River Hub" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: reqRow } = await supabase.from("info_requests").select("*").eq("id", id).maybeSingle();
  if (!reqRow) notFound();
  const r = reqRow as InfoRequest;

  const [{ data: links }, { data: docRows }, { data: eventRows }, { data: org }] = await Promise.all([
    supabase.from("info_request_assets").select("asset_id").eq("request_id", id),
    supabase.from("info_request_documents").select("*").eq("request_id", id).order("created_at"),
    supabase.from("info_request_events").select("*").eq("request_id", id).order("created_at", { ascending: false }),
    supabase.from("organisations").select("river_slug").eq("id", r.organisation_id).single(),
  ]);
  const assetIds = (links ?? []).map((l) => l.asset_id);
  const { data: assetRows } = assetIds.length
    ? await supabase.from("sewage_assets").select("id, asset_name, asset_type").in("id", assetIds)
    : { data: [] as { id: string; asset_name: string; asset_type: string | null }[] };

  const docs = (docRows as InfoRequestDocument[] | null) ?? [];
  // Short-lived links to the private evidence bucket.
  const signed = docs.length
    ? (await supabase.storage.from("evidence").createSignedUrls(docs.map((d) => d.storage_path), 600)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;

  const events = (eventRows as InfoRequestEvent[] | null) ?? [];
  const editor = canEdit(profile.role);
  const admin = profile.role === "admin";
  const due = dueLabel(r);
  const wdtkSendUrl =
    r.route === "whatdotheyknow" && r.authority_slug && r.status === "draft"
      ? wdtkNewRequestUrl({ authoritySlug: r.authority_slug, title: r.title, letter: r.body ?? "", riverSlug: org?.river_slug ?? "river", requestId: r.id })
      : null;

  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/requests" className="text-sm text-river-700 hover:underline">← All requests</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{r.title}</h1>
          <p className="text-sm text-gray-600">
            To <strong>{r.authority}</strong> under the {LAW_LABEL[r.law]} · {LAYER_LABEL[r.layer]}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusChip status={r.status} label={STATUS_LABEL[r.status]} />
          {due && <span className={`text-sm ${due.includes("late") ? "font-semibold text-red-700" : "text-gray-600"}`}>{due}</span>}
        </div>
      </div>

      <dl className="card grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs uppercase text-gray-500">Sent</dt><dd>{fmtDate(r.sent_on)}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Reply due</dt><dd>{fmtDate(r.extended_to ?? r.due_on)}{r.extended_to && <span className="text-gray-500"> (extended)</span>}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Replied</dt><dd>{fmtDate(r.answered_on)}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Their reference</dt><dd>{r.authority_ref ?? "—"}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase text-gray-500">Where</dt>
          <dd>
            {r.wdtk_url ? (
              <a href={r.wdtk_url} target="_blank" rel="noopener noreferrer" className="text-river-700 hover:underline">On WhatDoTheyKnow ↗</a>
            ) : r.route === "whatdotheyknow" ? "WhatDoTheyKnow (link not added yet)" : "Sent directly"}
          </dd>
        </div>
        <div><dt className="text-xs uppercase text-gray-500">On the public site</dt><dd>{r.is_public ? "Published" : "Not published"}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Data</dt><dd>{r.data_loaded ? "Loaded into River Hub" : "Not loaded yet"}</dd></div>
        {r.notes && (
          <div className="sm:col-span-3">
            <dt className="text-xs uppercase text-gray-500">Private notes</dt>
            <dd className="whitespace-pre-wrap">{r.notes}</dd>
          </div>
        )}
      </dl>

      {(assetRows ?? []).length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold text-gray-800">About</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {(assetRows ?? []).map((a) => (
              <li key={a.id}><Link href={`/assets/${a.id}`} className="rounded border border-gray-200 bg-white px-2 py-1 text-river-700 hover:border-river-500">{overflowLabel(a.asset_name, a.asset_type)}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <RequestActions
        request={{ id: r.id, status: r.status, law: r.law, route: r.route, title: r.title, body: r.body ?? "", authority_ref: r.authority_ref ?? "", wdtk_url: r.wdtk_url ?? "", notes: r.notes ?? "", is_public: r.is_public, data_loaded: r.data_loaded }}
        wdtkSendUrl={wdtkSendUrl}
        editor={editor}
        admin={admin}
      />

      {r.body && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold text-gray-800">The letter</h2>
          <pre className="card whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">{r.body}</pre>
        </section>
      )}

      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500">
            None yet.{r.route === "whatdotheyknow" ? " Replies to WhatDoTheyKnow requests are kept there; upload a copy only if you want it here too." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            {docs.map((d) => {
              const url = urlFor(d.storage_path);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span>
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-gray-600">{d.kind}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-river-700 hover:underline">{d.file_name}</a> : d.file_name}
                  </span>
                  <span className="text-xs text-gray-500">{fmtDate(d.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-gray-800">Timeline</h2>
        <ol className="space-y-2 border-l-2 border-gray-200 pl-4 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <div className="text-gray-800">
                {e.kind === "created" && "Request created"}
                {e.kind === "status" && e.status && <>Status: <strong>{STATUS_LABEL[e.status]}</strong></>}
                {e.kind === "published" && "Published on the river's public pages"}
                {e.kind === "unpublished" && "Removed from the public pages"}
                {(e.kind === "note" || e.kind === "document") && e.note}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
