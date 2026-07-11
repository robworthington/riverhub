// Bulk-import pipeline: parse (CSV/XLSX) -> map (bathing-water template) -> canonical records.
// Shared by the upload wizard and (later) the import API. See ../../../IMPORT-TOOL-DESIGN.md.
import ExcelJS from "exceljs";

export interface TestTypeRef { id: string; test_name: string; common_name: string | null; test_code: string | null }

export interface Measurement {
  test_type_id: string;
  test_name: string;
  value: number | null;
  qualifier: string; // '=' | '<' | '>'
  raw: string;
}
export interface CanonicalRecord {
  row: number;                 // 1-based data row number (for error messages)
  date: string | null;         // YYYY-MM-DD
  time: string | null;         // HH:mm
  fields: {
    rainfall: number | null;
    observed_weather: string | null;
    condition: "wet" | "dry" | null;
    temperature_c: number | null;
    salinity_ppt: number | null;
  };
  context: Record<string, unknown>;
  measurements: Measurement[];
  errors: string[];
}

// Measurement column aliases -> canonical test_type name (the org must have that test type).
const MEASUREMENT_ALIASES: { aliases: string[]; testName: string }[] = [
  { aliases: ["e.coli", "e. coli", "ecoli", "e coli"], testName: "E. coli (culture)" },
  { aliases: ["ie", "intestinal enterococci", "enterococci"], testName: "Intestinal enterococci (culture)" },
  { aliases: ["bactiquick", "bactiquick score"], testName: "Bactiquick" },
];
// Context column aliases -> first-class test_results field.
const CONTEXT_FIELDS: { aliases: string[]; field: keyof CanonicalRecord["fields"] }[] = [
  { aliases: ["rain 48hrs", "rain 48hr", "rain 48", "rainfall"], field: "rainfall" },
  { aliases: ["weather"], field: "observed_weather" },
  { aliases: ["condition"], field: "condition" },
  { aliases: ["temperature", "temp", "water temperature"], field: "temperature_c" },
  { aliases: ["salinity"], field: "salinity_ppt" },
];

function norm(s: string): string {
  return String(s).replace(/\([^)]*\)/g, "").replace(/[_-]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}
function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

type ColRole =
  | { kind: "date" } | { kind: "time" }
  | { kind: "measure"; testTypeId: string; testName: string }
  | { kind: "field"; field: keyof CanonicalRecord["fields"] }
  | { kind: "context"; key: string };

function classifyHeader(header: string, types: TestTypeRef[]): ColRole | null {
  const n = norm(header);
  if (!n) return null;
  if (/\bdate\b/.test(n)) return { kind: "date" };
  if (/\btime\b/.test(n)) return { kind: "time" };
  // measurement by alias -> canonical test name
  for (const m of MEASUREMENT_ALIASES) {
    if (m.aliases.includes(n)) {
      const t = types.find((t) => norm(t.test_name) === norm(m.testName));
      if (t) return { kind: "measure", testTypeId: t.id, testName: t.test_name };
    }
  }
  // measurement by direct match to an org test type
  const direct = types.find((t) =>
    [t.test_name, t.common_name, t.test_code].filter(Boolean).some((v) => norm(v as string) === n));
  if (direct) return { kind: "measure", testTypeId: direct.id, testName: direct.test_name };
  // context field
  for (const c of CONTEXT_FIELDS) if (c.aliases.includes(n)) return { kind: "field", field: c.field };
  // unrecognised -> passthrough context
  return { kind: "context", key: slug(header) };
}

function toDateStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function toTimeStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  if (typeof v === "number") { // fraction of a day
    const mins = Math.round((v % 1) * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function parseValue(v: unknown): { value: number | null; qualifier: string; raw: string } {
  const raw = v == null ? "" : String(v).trim();
  if (raw === "") return { value: null, qualifier: "=", raw };
  const q = raw.startsWith("<") ? "<" : raw.startsWith(">") ? ">" : "=";
  const num = parseFloat(raw.replace(/[<>,]/g, ""));
  return { value: Number.isFinite(num) ? num : null, qualifier: q, raw };
}
function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[,<>]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Locate the header row (first row containing a "date" cell) and return {headers, rows}. */
function findTable(grid: unknown[][]): { headers: string[]; rows: unknown[][] } {
  const hi = grid.findIndex((r) => r.some((c) => c != null && /date/i.test(String(c))));
  if (hi < 0) return { headers: [], rows: [] };
  return { headers: grid[hi].map((c) => (c == null ? "" : String(c))), rows: grid.slice(hi + 1) };
}

async function gridFromXlsx(buf: ArrayBuffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = row.values as unknown[]; // 1-indexed; drop [0]
    grid.push(vals.slice(1).map((c) => (c && typeof c === "object" && "text" in (c as object) ? (c as { text: unknown }).text : c)));
  });
  return grid;
}
function gridFromCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inq = false;
      else field += c;
    } else if (c === '"') inq = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

export interface ParseResult { records: CanonicalRecord[]; unmatchedColumns: string[]; measurementColumns: string[] }

export async function parseImport(
  buf: ArrayBuffer, format: "xlsx" | "csv", types: TestTypeRef[],
): Promise<ParseResult> {
  const grid = format === "xlsx" ? await gridFromXlsx(buf) : gridFromCsv(new TextDecoder().decode(buf));
  const { headers, rows } = findTable(grid);
  const roles = headers.map((h) => classifyHeader(h, types));
  const unmatched: string[] = [];
  const measureCols: string[] = [];
  roles.forEach((r, i) => {
    if (r?.kind === "context") unmatched.push(headers[i]);
    if (r?.kind === "measure") measureCols.push(headers[i]);
  });

  const records: CanonicalRecord[] = [];
  let n = 0;
  for (const row of rows) {
    if (!row.some((c) => c != null && String(c).trim() !== "")) continue; // skip blank
    n++;
    const rec: CanonicalRecord = {
      row: n, date: null, time: null,
      fields: { rainfall: null, observed_weather: null, condition: null, temperature_c: null, salinity_ppt: null },
      context: {}, measurements: [], errors: [],
    };
    roles.forEach((role, i) => {
      if (!role) return;
      const cell = row[i];
      switch (role.kind) {
        case "date": rec.date = toDateStr(cell); break;
        case "time": rec.time = toTimeStr(cell); break;
        case "measure": {
          const pv = parseValue(cell);
          if (pv.raw !== "") rec.measurements.push({ test_type_id: role.testTypeId, test_name: role.testName, ...pv });
          break;
        }
        case "field": {
          if (role.field === "observed_weather") rec.fields.observed_weather = cell == null ? null : String(cell).trim() || null;
          else if (role.field === "condition") {
            const s = String(cell ?? "").trim().toLowerCase();
            rec.fields.condition = s.startsWith("w") ? "wet" : s.startsWith("d") ? "dry" : null;
          } else rec.fields[role.field] = parseNum(cell);
          break;
        }
        case "context": if (cell != null && String(cell).trim() !== "") rec.context[role.key] = String(cell).trim(); break;
      }
    });
    if (!rec.date) rec.errors.push("missing or unrecognised date");
    if (!rec.measurements.length) rec.errors.push("no measurement values in row");
    records.push(rec);
  }
  return { records, unmatchedColumns: [...new Set(unmatched)], measurementColumns: [...new Set(measureCols)] };
}

export function detectFormat(filename: string): "xlsx" | "csv" | null {
  const f = filename.toLowerCase();
  return f.endsWith(".xlsx") ? "xlsx" : f.endsWith(".csv") ? "csv" : null;
}
