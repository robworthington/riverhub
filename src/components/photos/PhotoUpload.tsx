"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanImage } from "@/lib/imageClean";
import { photoPaths, type PhotoLicence } from "@/lib/photos";
import { overflowLabel } from "@/lib/overflowNames";
import { createPhoto } from "@/app/(app)/photos/actions";

type AssetOption = { id: string; name: string; type: string | null };

const LARGE_EDGE = 2000; // px, longer edge: sharp on a big screen, a few hundred KB
const THUMB_EDGE = 640;

// Upload a photo of the river. The browser cleans it (no location, no camera data) and resizes it
// before anything leaves the device; only those cleaned copies are uploaded, privately, for an admin
// to approve.
export function PhotoUpload({ orgId, defaultCredit, assets, isAdmin }: { orgId: string; defaultCredit: string; assets: AssetOption[]; isAdmin: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [place, setPlace] = useState("");
  const [takenOn, setTakenOn] = useState("");
  const [credit, setCredit] = useState(defaultCredit);
  const [licence, setLicence] = useState<PhotoLicence>("cc_by_4");
  const [assetId, setAssetId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setDone(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    // The file's own date is a reasonable default for "taken"; the photo's embedded date is dropped
    // with the rest of its metadata.
    if (f && !takenOn) setTakenOn(new Date(f.lastModified).toLocaleDateString("en-CA", { timeZone: "Europe/London" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Choose a photo first."); return; }
    if (!consent) { setError("Please tick the box to confirm you took the photo and anyone identifiable agreed."); return; }
    setBusy(true);
    setError(null);
    try {
      const [large, thumb] = await Promise.all([cleanImage(file, LARGE_EDGE), cleanImage(file, THUMB_EDGE, 0.8)]);
      const id = crypto.randomUUID();
      const paths = photoPaths(orgId, id);
      const storage = createClient().storage.from("evidence");
      for (const [path, blob] of [[paths.privateLarge, large.blob], [paths.privateThumb, thumb.blob]] as const) {
        const { error: upErr } = await storage.upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error(upErr.message);
      }
      const res = await createPhoto({ id, caption, place, takenOn, credit, licence, consent, assetId: assetId || null, width: large.width, height: large.height });
      if (res.error) {
        await storage.remove([paths.privateLarge, paths.privateThumb]);
        throw new Error(res.error);
      }
      setFile(null);
      setPreview(null);
      setCaption("");
      setPlace("");
      setTakenOn("");
      setAssetId("");
      setConsent(false);
      setDone(isAdmin ? "Uploaded. It's waiting below: approve it to make it public." : "Uploaded. A group admin will check it before it goes public.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-base font-semibold">Add a photo</h2>
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex h-32 w-48 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-600 hover:border-river-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Selected photo" className="h-full w-full object-cover" /> : <span>Choose or take a photo</span>}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} disabled={busy} />
        </label>
        <div className="grid min-w-[260px] flex-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ph-caption" className="label">Caption</label>
            <input id="ph-caption" className="input" placeholder="What it shows, e.g. The river below the weir after heavy rain" value={caption} onChange={(e) => setCaption(e.target.value)} required maxLength={200} />
          </div>
          <div>
            <label htmlFor="ph-place" className="label">Place <span className="font-normal text-gray-500">(optional)</span></label>
            <input id="ph-place" className="input" placeholder="e.g. near Totnes" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="ph-date" className="label">Taken on</label>
            <input id="ph-date" type="date" className="input" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ph-credit" className="label">Credit</label>
            <input id="ph-credit" className="input" value={credit} onChange={(e) => setCredit(e.target.value)} required maxLength={80} />
          </div>
          {assets.length > 0 && (
            <div>
              <label htmlFor="ph-asset" className="label">Of an overflow or works <span className="font-normal text-gray-500">(optional)</span></label>
              <select id="ph-asset" className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">No, the river generally</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{overflowLabel(a.name, a.type)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <fieldset className="space-y-1 text-sm">
        <legend className="label">Licence</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="licence" checked={licence === "cc_by_4"} onChange={() => setLicence("cc_by_4")} className="mt-1" />
          <span><strong>CC BY 4.0</strong>: anyone may reuse it with credit (recommended, so the press and other groups can use it).</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="licence" checked={licence === "river_hub_only"} onChange={() => setLicence("river_hub_only")} className="mt-1" />
          <span><strong>River Hub use only</strong>: shown on River Hub, not licensed for reuse.</span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I took this photo, and anyone who can be identified in it agreed. It shows no children who can be identified,
          no private gardens and nothing that shows where someone lives.
        </span>
      </label>

      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {done && <p role="status" className="text-sm font-medium text-emerald-700">{done}</p>}
      <button type="submit" className="btn" disabled={busy || !file}>{busy ? "Cleaning and uploading…" : "Upload photo"}</button>
    </form>
  );
}
