"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addPermit, type PermitInput } from "@/app/(app)/assets/actions";

export function PermitForm({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<File | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    let docPath: string | null = null;
    if (doc) {
      const supabase = createClient();
      const path = `assets/${assetId}/permits/${crypto.randomUUID()}-${doc.name}`;
      const { error: upErr } = await supabase.storage.from("evidence").upload(path, doc);
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setBusy(false);
        return;
      }
      docPath = path;
    }

    const input: PermitInput = {
      permit_number: str(fd.get("permit_number")),
      permit_start_date: str(fd.get("permit_start_date")),
      permit_revocation_date: str(fd.get("permit_revocation_date")),
      required_processing_volume: num(fd.get("required_processing_volume")),
      required_storage_capacity: num(fd.get("required_storage_capacity")),
      permit_url: str(fd.get("permit_url")),
      permit_doc_path: docPath,
      permit_dwf_m3d: num(fd.get("permit_dwf_m3d")),
      permit_fft_m3d: num(fd.get("permit_fft_m3d")),
      permit_pe: num(fd.get("permit_pe")),
    };
    const res = await addPermit(assetId, input);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        Add permit
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-gray-200 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Permit number</label>
          <input name="permit_number" className="input" />
        </div>
        <div>
          <label className="label">Start date</label>
          <input name="permit_start_date" type="date" className="input" />
        </div>
        <div>
          <label className="label">Revocation date</label>
          <input name="permit_revocation_date" type="date" className="input" />
        </div>
        <div>
          <label className="label">Required processing (m³/day)</label>
          <input name="required_processing_volume" inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label">Required storage (m³)</label>
          <input name="required_storage_capacity" inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label">Permit DWF (m³/day)</label>
          <input name="permit_dwf_m3d" inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label">Permit FFT (m³/day)</label>
          <input name="permit_fft_m3d" inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label">Design PE</label>
          <input name="permit_pe" inputMode="decimal" className="input" />
        </div>
        <div className="col-span-2">
          <label className="label">EA permit page (URL)</label>
          <input name="permit_url" type="url" placeholder="https://environment.data.gov.uk/..." className="input" />
        </div>
        <div className="col-span-2">
          <label className="label">Permit document (PDF)</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="block text-sm"
            onChange={(e) => setDoc(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save permit"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = v ? String(v).trim() : "";
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
