"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addAssetPhoto } from "@/app/(app)/assets/actions";

export function AssetPhotoUpload({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const path = `assets/${assetId}/photos/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("evidence").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }
    const res = await addAssetPhoto(assetId, path, null);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="mt-2">
      <label className="btn-secondary cursor-pointer text-xs">
        {busy ? "Uploading…" : "Upload photo"}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={onChange} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
