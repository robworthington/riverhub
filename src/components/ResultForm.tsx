"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createResult, type ResultInput } from "@/app/(app)/results/actions";
import type { TestSite, TestType } from "@/lib/types";

export function ResultForm({
  sites,
  testTypes,
  defaultSiteId,
  defaultPerson,
  defaultOrg,
}: {
  sites: Pick<TestSite, "id" | "name">[];
  testTypes: TestType[];
  defaultSiteId?: string;
  defaultPerson?: string;
  defaultOrg?: string;
}) {
  const now = useMemo(() => new Date(), []);
  const today = now.toISOString().slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typeId, setTypeId] = useState(testTypes[0]?.id ?? "");
  const [coc, setCoc] = useState<File | null>(null);

  const unit = testTypes.find((t) => t.id === typeId)?.primary_unit;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createClient();

    let cocPath: string | null = null;
    if (coc) {
      const path = `results/coc/${crypto.randomUUID()}-${coc.name}`;
      const { error: upErr } = await supabase.storage.from("evidence").upload(path, coc);
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setBusy(false);
        return;
      }
      cocPath = path;
    }

    const input: ResultInput = {
      site_id: String(fd.get("site_id") || ""),
      test_type_id: String(fd.get("test_type_id") || ""),
      date_collected: String(fd.get("date_collected") || today),
      time_collected: str(fd.get("time_collected")),
      person_collecting: str(fd.get("person_collecting")),
      organisation_collecting: str(fd.get("organisation_collecting")),
      result: num(fd.get("result")),
      rainfall: num(fd.get("rainfall")),
      condition: (str(fd.get("condition")) as ResultInput["condition"]) ?? null,
      other_observations: str(fd.get("other_observations")),
      chain_of_custody_path: cocPath,
    };

    if (!input.site_id || !input.test_type_id) {
      setError("Site and test type are required.");
      setBusy(false);
      return;
    }

    const res = await createResult(input);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Site *</label>
        <select name="site_id" required className="input" defaultValue={defaultSiteId ?? ""}>
          <option value="">Select a site…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date collected *</label>
          <input name="date_collected" type="date" required className="input" defaultValue={today} />
        </div>
        <div>
          <label className="label">Time collected</label>
          <input name="time_collected" type="time" className="input" defaultValue={hhmm} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Test type *</label>
          <select
            name="test_type_id"
            required
            className="input"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            {testTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.test_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Result{unit ? ` (${unit})` : ""}</label>
          <input name="result" inputMode="decimal" className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Condition</label>
          <select name="condition" className="input">
            <option value="">—</option>
            <option value="dry">Dry</option>
            <option value="wet">Wet</option>
          </select>
        </div>
        <div>
          <label className="label">Rainfall</label>
          <input name="rainfall" inputMode="decimal" className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Person collecting</label>
          <input name="person_collecting" className="input" defaultValue={defaultPerson ?? ""} />
        </div>
        <div>
          <label className="label">Organisation</label>
          <input name="organisation_collecting" className="input" defaultValue={defaultOrg ?? ""} />
        </div>
      </div>

      <div>
        <label className="label">Other observations</label>
        <textarea name="other_observations" rows={2} className="input" />
      </div>

      <div>
        <label className="label">Chain of custody</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="block text-sm"
          onChange={(e) => setCoc(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn w-full" disabled={busy}>
        {busy ? "Saving…" : "Save result"}
      </button>
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
