"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSite, updateSite, type SiteInput } from "@/app/(app)/sites/actions";
import type { Parish, WaterBody, TestSite } from "@/lib/types";

export function SiteForm({
  parishes,
  waterBodies,
  site,
}: {
  parishes: Parish[];
  waterBodies: WaterBody[];
  site?: TestSite;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lat, setLat] = useState<string>(site?.latitude?.toString() ?? "");
  const [lng, setLng] = useState<string>(site?.longitude?.toString() ?? "");
  const [files, setFiles] = useState<FileList | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => setError("Could not get your location."),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    // Upload any new photos to storage first.
    const photos: { storage_path: string }[] = [];
    if (files) {
      for (const file of Array.from(files)) {
        const path = `sites/photos/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("evidence")
          .upload(path, file);
        if (upErr) {
          setError(`Photo upload failed: ${upErr.message}`);
          setBusy(false);
          return;
        }
        photos.push({ storage_path: path });
      }
    }

    const input: SiteInput = {
      name: String(fd.get("name") || ""),
      site_code: str(fd.get("site_code")),
      type: (fd.get("type") as SiteInput["type"]) || null,
      rationale: str(fd.get("rationale")),
      description: str(fd.get("description")),
      parish_id: str(fd.get("parish_id")),
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
      what_three_words: str(fd.get("what_three_words")),
      tidal: fd.get("tidal") === "on",
      water_body_id: str(fd.get("water_body_id")),
      public_or_private: boolOrNull(fd.get("public_or_private")),
      land_ownership: str(fd.get("land_ownership")),
      sampling_strategy: str(fd.get("sampling_strategy")),
      land_access_permission: fd.get("land_access_permission") === "on",
      access_point: str(fd.get("access_point")),
      notes: str(fd.get("notes")),
      photos,
    };

    const res = site ? await updateSite(site.id, input) : await createSite(input);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
    // success → server action redirects
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" required>
        <input name="name" required className="input" defaultValue={site?.name ?? ""} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Site code">
          <input name="site_code" className="input" defaultValue={site?.site_code ?? ""} />
        </Field>
        <Field label="Type">
          <select name="type" className="input" defaultValue={site?.type ?? ""}>
            <option value="">—</option>
            <option value="bathing_water">Bathing water</option>
            <option value="community_designated">Community designated</option>
          </select>
        </Field>
      </div>

      <Field label="Parish">
        <select name="parish_id" className="input" defaultValue={site?.parish_id ?? ""}>
          <option value="">—</option>
          {parishes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.district}, {p.county})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Water body">
        <select name="water_body_id" className="input" defaultValue={site?.water_body_id ?? ""}>
          <option value="">—</option>
          {waterBodies.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Location">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="text-xs text-gray-500">Latitude</span>
            <input
              className="input"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </div>
          <div>
            <span className="text-xs text-gray-500">Longitude</span>
            <input
              className="input"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
          <button type="button" className="btn-secondary" onClick={useMyLocation}>
            Use my location
          </button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="What3Words">
          <input name="what_three_words" className="input" defaultValue={site?.what_three_words ?? ""} />
        </Field>
        <Field label="Access point">
          <input name="access_point" className="input" defaultValue={site?.access_point ?? ""} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6">
        <Checkbox name="tidal" label="Tidal" defaultChecked={site?.tidal ?? false} />
        <Checkbox
          name="land_access_permission"
          label="Land access permission"
          defaultChecked={site?.land_access_permission ?? false}
        />
        <Field label="Public / private">
          <select name="public_or_private" className="input" defaultValue={boolToStr(site?.public_or_private)}>
            <option value="">—</option>
            <option value="true">Public</option>
            <option value="false">Private</option>
          </select>
        </Field>
      </div>

      <Field label="Land ownership (CRM ref)">
        <input name="land_ownership" className="input" defaultValue={site?.land_ownership ?? ""} />
      </Field>
      <Field label="Rationale">
        <textarea name="rationale" className="input" rows={2} defaultValue={site?.rationale ?? ""} />
      </Field>
      <Field label="Sampling strategy & timeframe">
        <input name="sampling_strategy" className="input" defaultValue={site?.sampling_strategy ?? ""} />
      </Field>
      <Field label="Description">
        <textarea name="description" className="input" rows={2} defaultValue={site?.description ?? ""} />
      </Field>
      <Field label="Notes">
        <textarea name="notes" className="input" rows={2} defaultValue={site?.notes ?? ""} />
      </Field>

      <Field label={site ? "Add photos" : "Photos"}>
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="block text-sm"
          onChange={(e) => setFiles(e.target.files)}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : site ? "Save changes" : "Create site"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function boolOrNull(v: FormDataEntryValue | null): boolean | null {
  const s = v ? String(v) : "";
  return s === "" ? null : s === "true";
}
function boolToStr(v: boolean | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}
