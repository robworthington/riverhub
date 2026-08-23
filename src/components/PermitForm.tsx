"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addPermit, updatePermit, type PermitInput } from "@/app/(app)/assets/actions";
import type { AssetPermit } from "@/lib/types";

/** Add- or edit-a-permit form. Pass `permit` to edit; omit to add. */
export function PermitForm({
  assetId,
  permit,
  onDone,
  onCancel,
}: {
  assetId: string;
  permit?: AssetPermit;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<File | null>(null);
  const editing = !!permit;

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
      required_storage_capacity: num(fd.get("required_storage_capacity")),
      permit_url: str(fd.get("permit_url")),
      permit_dwf_m3d: num(fd.get("permit_dwf_m3d")),
      permit_fft_m3d: num(fd.get("permit_fft_m3d")),
      permit_pe: num(fd.get("permit_pe")),
    };
    // only touch the document path when a new file was chosen (don't wipe an existing one on edit)
    if (docPath !== null) input.permit_doc_path = docPath;

    const res = editing ? await updatePermit(permit!.id, assetId, input) : await addPermit(assetId, input);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      router.refresh();
      onDone();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-gray-200 p-3">
      <p className="text-sm font-semibold text-gray-700">{editing ? "Edit permit" : "Add permit"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Permit number</label>
          <input name="permit_number" className="input" defaultValue={permit?.permit_number ?? ""} />
        </div>
        <div>
          <label className="label">Start date</label>
          <input name="permit_start_date" type="date" className="input" defaultValue={permit?.permit_start_date ?? ""} />
        </div>
        <div>
          <label className="label">Revocation date</label>
          <input name="permit_revocation_date" type="date" className="input" defaultValue={permit?.permit_revocation_date ?? ""} />
        </div>
        <div>
          <label className="label">Permit DWF (m³/day)</label>
          <input name="permit_dwf_m3d" inputMode="decimal" className="input" defaultValue={permit?.permit_dwf_m3d ?? ""} />
          <p className="mt-0.5 text-xs text-gray-400">Consented dry-weather flow. Drives the “Permit requirement” comparison on the system page.</p>
        </div>
        <div>
          <label className="label">Permit FFT / pass-forward (m³/day)</label>
          <input name="permit_fft_m3d" inputMode="decimal" className="input" defaultValue={permit?.permit_fft_m3d ?? ""} />
          <p className="mt-0.5 text-xs text-gray-400">Flow above which the storm overflow may legally spill — not the works’ treatment capacity.</p>
        </div>
        <div>
          <label className="label">Permit design PE (load)</label>
          <input name="permit_pe" inputMode="decimal" className="input" defaultValue={permit?.permit_pe ?? ""} />
          <p className="mt-0.5 text-xs text-gray-400">Population equivalent — a BOD load measure, not resident population or flow.</p>
        </div>
        <div>
          <label className="label">Permit storm storage (m³)</label>
          <input name="required_storage_capacity" inputMode="decimal" className="input" defaultValue={permit?.required_storage_capacity ?? ""} />
          <p className="mt-0.5 text-xs text-gray-400">Storm-tank volume the permit requires.</p>
        </div>
        <div className="col-span-2">
          <label className="label">EA permit page (URL)</label>
          <input name="permit_url" type="url" placeholder="https://environment.data.gov.uk/..." className="input" defaultValue={permit?.permit_url ?? ""} />
        </div>
        <div className="col-span-2">
          <label className="label">Permit document (PDF){editing && permit?.permit_doc_path ? " — replaces the existing file" : ""}</label>
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
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add permit"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
