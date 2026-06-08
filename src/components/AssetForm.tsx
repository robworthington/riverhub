"use client";

import { useState } from "react";
import { createAsset, updateAsset, type AssetInput } from "@/app/(app)/assets/actions";
import type { Parish, WaterBody, SewageSystem, SewageAsset, AssetType } from "@/lib/types";

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "combined_sewer_overflow", label: "Combined sewer overflow" },
  { value: "sewage_treatment_works", label: "Sewage treatment works" },
  { value: "pumping_station", label: "Pumping station" },
  { value: "storm_tank", label: "Storm tank" },
];

export function AssetForm({
  systems,
  waterBodies,
  parishes,
  asset,
}: {
  systems: SewageSystem[];
  waterBodies: WaterBody[];
  parishes: Parish[];
  asset?: SewageAsset;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input: AssetInput = {
      asset_name: String(fd.get("asset_name") || ""),
      asset_unique_id: str(fd.get("asset_unique_id")),
      asset_type: (str(fd.get("asset_type")) as AssetType) ?? null,
      sewage_system_id: str(fd.get("sewage_system_id")),
      water_body_id: str(fd.get("water_body_id")),
      parish_id: str(fd.get("parish_id")),
      storage_capacity: num(fd.get("storage_capacity")),
      processing_capacity: num(fd.get("processing_capacity")),
      asset_owner: str(fd.get("asset_owner")),
      asset_address: str(fd.get("asset_address")),
      postcode: str(fd.get("postcode")),
      latitude: num(fd.get("latitude")),
      longitude: num(fd.get("longitude")),
      edm_enabled: fd.get("edm_enabled") === "on",
      actual_capacity_m3d: num(fd.get("actual_capacity_m3d")),
      actual_capacity_source: str(fd.get("actual_capacity_source")),
      eir_ref: str(fd.get("eir_ref")),
      eir_requested_on: str(fd.get("eir_requested_on")),
      eir_received_on: str(fd.get("eir_received_on")),
      notes: str(fd.get("notes")),
    };
    if (!input.asset_name) {
      setError("Asset name is required.");
      setBusy(false);
      return;
    }
    const res = asset ? await updateAsset(asset.id, input) : await createAsset(input);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Asset name" required>
        <input name="asset_name" required className="input" defaultValue={asset?.asset_name ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <select name="asset_type" className="input" defaultValue={asset?.asset_type ?? ""}>
            <option value="">—</option>
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Sewage system">
          <select name="sewage_system_id" className="input" defaultValue={asset?.sewage_system_id ?? ""}>
            <option value="">—</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="EDM outlet ID">
          <input
            name="asset_unique_id"
            className="input"
            placeholder="e.g. SBB00885"
            defaultValue={asset?.asset_unique_id ?? ""}
          />
        </Field>
        <Field label="Water body">
          <select name="water_body_id" className="input" defaultValue={asset?.water_body_id ?? ""}>
            <option value="">—</option>
            {waterBodies.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="edm_enabled" defaultChecked={asset?.edm_enabled ?? true} className="h-4 w-4" />
        Pull spill data from the EDM feed for this asset
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Storage capacity (m³)">
          <input name="storage_capacity" inputMode="decimal" className="input" defaultValue={asset?.storage_capacity ?? ""} />
        </Field>
        <Field label="Processing capacity (m³/day)">
          <input name="processing_capacity" inputMode="decimal" className="input" defaultValue={asset?.processing_capacity ?? ""} />
        </Field>
      </div>

      <Field label="Asset owner">
        <input name="asset_owner" className="input" defaultValue={asset?.asset_owner ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Address">
          <input name="asset_address" className="input" defaultValue={asset?.asset_address ?? ""} />
        </Field>
        <Field label="Postcode">
          <input name="postcode" className="input" defaultValue={asset?.postcode ?? ""} />
        </Field>
      </div>

      <Field label="Parish">
        <select name="parish_id" className="input" defaultValue={asset?.parish_id ?? ""}>
          <option value="">—</option>
          {parishes.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.district}, {p.county})</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Latitude">
          <input name="latitude" inputMode="decimal" className="input" defaultValue={asset?.latitude ?? ""} />
        </Field>
        <Field label="Longitude">
          <input name="longitude" inputMode="decimal" className="input" defaultValue={asset?.longitude ?? ""} />
        </Field>
      </div>

      <fieldset className="rounded-md border border-gray-200 p-3">
        <legend className="px-1 text-xs uppercase text-gray-400">Actual installed capacity (EIR)</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Actual capacity (m³/day)">
            <input name="actual_capacity_m3d" inputMode="decimal" className="input" defaultValue={asset?.actual_capacity_m3d ?? ""} />
          </Field>
          <Field label="Source">
            <input name="actual_capacity_source" className="input" placeholder="e.g. SWW EIR response" defaultValue={asset?.actual_capacity_source ?? ""} />
          </Field>
          <Field label="EIR reference">
            <input name="eir_ref" className="input" defaultValue={asset?.eir_ref ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="EIR requested">
              <input name="eir_requested_on" type="date" className="input" defaultValue={asset?.eir_requested_on ?? ""} />
            </Field>
            <Field label="EIR received">
              <input name="eir_received_on" type="date" className="input" defaultValue={asset?.eir_received_on ?? ""} />
            </Field>
          </div>
        </div>
      </fieldset>

      <Field label="Notes">
        <textarea name="notes" rows={2} className="input" defaultValue={asset?.notes ?? ""} />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : asset ? "Save changes" : "Create asset"}
      </button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
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
