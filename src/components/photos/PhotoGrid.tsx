"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePhoto, deletePhoto, editPhoto, hidePhoto, setHero } from "@/app/(app)/photos/actions";
import { LICENCE_LABEL, STATUS_LABEL, type PhotoLicence, type PhotoStatus } from "@/lib/photos";
import { overflowLabel } from "@/lib/overflowNames";

export type GridPhoto = {
  id: string; caption: string; place: string | null; takenOn: string | null; credit: string; licence: PhotoLicence;
  status: PhotoStatus; isHero: boolean; assetId: string | null; mine: boolean; thumbUrl: string | null; largeUrl: string | null;
};
type AssetOption = { id: string; name: string; type: string | null };

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export function PhotoGrid({ photos, isAdmin, assets }: { photos: GridPhoto[]; isAdmin: boolean; assets: AssetOption[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((p) => <PhotoCard key={p.id} photo={p} isAdmin={isAdmin} assets={assets} />)}
    </ul>
  );
}

function PhotoCard({ photo: p, isAdmin, assets }: { photo: GridPhoto; isAdmin: boolean; assets: AssetOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ caption: p.caption, place: p.place ?? "", takenOn: p.takenOn ?? "", credit: p.credit, assetId: p.assetId ?? "" });
  const asset = assets.find((a) => a.id === p.assetId);

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else { after?.(); router.refresh(); }
    });
  }

  return (
    <li className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <a href={p.largeUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-gray-100">
        {p.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbUrl} alt={p.caption} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-gray-500">Preview unavailable</span>
        )}
      </a>
      <div className="space-y-2 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900">{p.caption}</p>
          {p.isHero && <span className="shrink-0 rounded-full bg-river-700 px-2 py-0.5 text-[11px] font-semibold text-white">Lead photo</span>}
        </div>
        <p className="text-xs text-gray-500">
          {[p.place, fmt(p.takenOn), asset ? overflowLabel(asset.name, asset.type) : null].filter(Boolean).join(" · ")}
        </p>
        <p className="text-xs text-gray-500">Photo: {p.credit} · {LICENCE_LABEL[p.licence]} · {STATUS_LABEL[p.status]}</p>
        {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {isAdmin && p.status !== "approved" && (
            <button type="button" className="btn px-3 py-1 text-xs" disabled={pending} onClick={() => run(() => approvePhoto(p.id))}>Approve</button>
          )}
          {isAdmin && p.status === "approved" && (
            <>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={pending} onClick={() => run(() => setHero(p.id, !p.isHero))}>
                {p.isHero ? "Not the lead photo" : "Make lead photo"}
              </button>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={pending} onClick={() => run(() => hidePhoto(p.id))}>Hide</button>
            </>
          )}
          {isAdmin && (
            <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>Edit</button>
          )}
          {(isAdmin || (p.mine && p.status === "pending")) && (
            <button
              type="button"
              className="ml-auto text-xs text-red-700 hover:underline"
              disabled={pending}
              onClick={() => { if (window.confirm("Delete this photo everywhere? This can't be undone.")) run(() => deletePhoto(p.id)); }}
            >
              {isAdmin ? "Delete" : "Withdraw"}
            </button>
          )}
        </div>

        {editing && isAdmin && (
          <form className="space-y-2 border-t border-gray-100 pt-2" onSubmit={(e) => { e.preventDefault(); run(() => editPhoto(p.id, f), () => setEditing(false)); }}>
            <input aria-label="Caption" className="input" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} required />
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Place" className="input" placeholder="Place" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
              <input aria-label="Taken on" type="date" className="input" value={f.takenOn} onChange={(e) => setF({ ...f, takenOn: e.target.value })} />
            </div>
            <input aria-label="Credit" className="input" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} required />
            {assets.length > 0 && (
              <select aria-label="Overflow or works" className="input" value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}>
                <option value="">The river generally</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{overflowLabel(a.name, a.type)}</option>)}
              </select>
            )}
            <button type="submit" className="btn px-3 py-1 text-xs" disabled={pending}>Save</button>
          </form>
        )}
      </div>
    </li>
  );
}
