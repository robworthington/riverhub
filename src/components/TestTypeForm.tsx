"use client";

import { useState } from "react";
import {
  createTestType,
  updateTestType,
  type TestTypeInput,
} from "@/app/(app)/test-types/actions";
import type { TestType } from "@/lib/types";

export function TestTypeForm({ testType }: { testType?: TestType }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input: TestTypeInput = {
      test_name: String(fd.get("test_name") || ""),
      common_name: str(fd.get("common_name")),
      test_code: str(fd.get("test_code")),
      category: (str(fd.get("category")) as TestTypeInput["category"]) ?? null,
      subcategory: str(fd.get("subcategory")),
      measurement_type: str(fd.get("measurement_type")),
      primary_unit: str(fd.get("primary_unit")),
      threshold_source: str(fd.get("threshold_source")),
      health_risk_levels: str(fd.get("health_risk_levels")),
    };
    const res = testType
      ? await updateTestType(testType.id, input)
      : await createTestType(input);
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Test name *</label>
        <input name="test_name" required className="input" defaultValue={testType?.test_name ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Common name</label>
          <input name="common_name" className="input" defaultValue={testType?.common_name ?? ""} />
        </div>
        <div>
          <label className="label">Test code</label>
          <input name="test_code" className="input" defaultValue={testType?.test_code ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <select name="category" className="input" defaultValue={testType?.category ?? ""}>
            <option value="">—</option>
            <option value="biological">Biological</option>
            <option value="chemical">Chemical</option>
            <option value="physical">Physical</option>
          </select>
        </div>
        <div>
          <label className="label">Subcategory</label>
          <input name="subcategory" className="input" defaultValue={testType?.subcategory ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Measurement type</label>
          <input name="measurement_type" className="input" defaultValue={testType?.measurement_type ?? ""} />
        </div>
        <div>
          <label className="label">Primary unit</label>
          <input name="primary_unit" className="input" defaultValue={testType?.primary_unit ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Threshold source</label>
          <input name="threshold_source" className="input" defaultValue={testType?.threshold_source ?? ""} />
        </div>
        <div>
          <label className="label">Health-risk levels</label>
          <input name="health_risk_levels" className="input" defaultValue={testType?.health_risk_levels ?? ""} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : testType ? "Save changes" : "Create test type"}
      </button>
    </form>
  );
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
