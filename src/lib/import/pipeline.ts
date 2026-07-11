// Bulk-import pipeline: parse (CSV/XLSX, multi-sheet) -> map (auto + overrides) -> canonical records.
// Shared by the upload wizard and (later) the import API. See ../../../IMPORT-TOOL-DESIGN.md.
import ExcelJS from "exceljs";

export interface TestTypeRef { id: string; test_name: string; common_name: string | null; test_code: string | null }

export interface Measurement { test_type_id: string; test_name: string; value: number | null; qualifier: string; raw: string }
export interface CanonicalRecord {
  row: number;
  site_name: string | null;    // from a Site column, else the sheet/title label
  date: string | null;
  time: string | null;
  fields: { rainfall: number | null; observed_weather: string | null; condition: "wet" | "dry" | null; temperature_c: number | null; salinity_ppt: number | null };
  context: Record<string, unknown>;
  measurements: Measurement[];
  errors: string[];
}
export interface ColumnMap { header: string; role: string }   // role = serialised role string
export interface ParseResult {
  records: CanonicalRecord[];
  columns: ColumnMap[];
  siteNames: string[];         // distinct detected site labels
  headerSignature: string;
}

const MEASUREMENT_ALIASES: { aliases: string[]; testName: string }[] = [
  { aliases: ["e.coli", "e. coli", "ecoli", "e coli"], testName: "E. coli (culture)" },
  { aliases: ["ie", "intestinal enterococci", "enterococci"], testName: "Intestinal enterococci (culture)" },
  { aliases: ["bactiquick", "bactiquick score"], testName: "Bactiquick" },
];
const FIELD_ALIASES: { aliases: string[]; field: keyof CanonicalRecord["fields"] }[] = [
  { aliases: ["rain 48hrs", "rain 48hr", "rain 48", "rainfall"], field: "rainfall" },
  { aliases: ["weather"], field: "observed_weather" },
  { aliases: ["condition"], field: "condition" },
  { aliases: ["temperature", "temp", "water temperature"], field: "temperature_c" },
  { aliases: ["salinity"], field: "salinity_ppt" },
];
export const FIELD_KEYS = ["rainfall", "observed_weather", "condition", "temperature_c", "salinity_ppt"] as const;

export function norm(s: string): string {
  return String(s).replace(/\([^)]*\)/g, "").replace(/[_-]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}
function slug(s: string): string { return norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

// role string vocabulary: date | time | site | ignore | context | field:<key> | measure:<testTypeId>
function classifyHeaderRole(header: string, types: TestTypeRef[]): string {
  const n = norm(header);
  if (!n) return "ignore";
  if (/\bsite\b|\blocation\b/.test(n)) return "site";
  if (/\bdate\b/.test(n)) return "date";
  if (/\btime\b/.test(n)) return "time";
  for (const m of MEASUREMENT_ALIASES) if (m.aliases.includes(n)) {
    const t = types.find((t) => norm(t.test_name) === norm(m.testName));
    if (t) return `measure:${t.id}`;
  }
  const direct = types.find((t) => [t.test_name, t.common_name, t.test_code].filter(Boolean).some((v) => norm(v as string) === n));
  if (direct) return `measure:${direct.id}`;
  for (const c of FIELD_ALIASES) if (c.aliases.includes(n)) return `field:${c.field}`;
  return "context";
}

function toDateStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  const s = String(v).trim(); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function toTimeStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  if (typeof v === "number") { const mins = Math.round((v % 1) * 1440); return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; }
  const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function parseValue(v: unknown): { value: number | null; qualifier: string; raw: string } {
  const raw = v == null ? "" : String(v).trim();
  if (raw === "") return { value: null, qualifier: "=", raw };
  const q = raw.startsWith("<") ? "<" : raw.startsWith(">") ? ">" : "=";
  const num = parseFloat(raw.replace(/[<>,]/g, ""));
  return { value: Number.isFinite(num) ? num : null, qualifier: q, raw };
}
function parseNum(v: unknown): number | null { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(/[,<>]/g, "")); return Number.isFinite(n) ? n : null; }

function findTable(grid: unknown[][]): { headers: string[]; rows: unknown[][]; title: string | null } {
  const hi = grid.findIndex((r) => r.some((c) => c != null && /date/i.test(String(c))));
  if (hi < 0) return { headers: [], rows: [], title: null };
  let title: string | null = null;
  for (let i = 0; i < hi; i++) { const c = grid[i].find((x) => x != null && String(x).trim() !== ""); if (c) { title = String(c).trim(); break; } }
  return { headers: grid[hi].map((c) => (c == null ? "" : String(c))), rows: grid.slice(hi + 1), title };
}
function stripSheetPrefix(s: string): string { return s.replace(/^sheet\s*\d+\s*[-–—:]\s*/i, "").trim(); }

async function xlsxSheets(buf: ArrayBuffer): Promise<{ sheet: string; grid: unknown[][] }[]> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  return wb.worksheets.map((ws) => {
    const grid: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const vals = row.values as unknown[];
      grid.push(vals.slice(1).map((c) => (c && typeof c === "object" && "text" in (c as object) ? (c as { text: unknown }).text : c)));
    });
    return { sheet: ws.name, grid };
  });
}
function csvGrid(text: string): unknown[][] {
  const rows: string[][] = []; let cur: string[] = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inq = false; else field += c; }
    else if (c === '"') inq = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(field); rows.push(cur); cur = []; field = ""; }
    else field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

export async function parseImport(
  buf: ArrayBuffer, format: "xlsx" | "csv", types: TestTypeRef[], overrides?: Record<string, string>,
): Promise<ParseResult> {
  const sheets = format === "xlsx" ? await xlsxSheets(buf) : [{ sheet: "", grid: csvGrid(new TextDecoder().decode(buf)) }];
  const records: CanonicalRecord[] = [];
  let columns: ColumnMap[] = [];
  let signature = "";
  let n = 0;

  for (const { sheet, grid } of sheets) {
    const { headers, rows, title } = findTable(grid);
    if (!headers.length) continue;
    const roles = headers.map((h) => overrides?.[norm(h)] ?? classifyHeaderRole(h, types));
    if (!columns.length) {
      columns = headers.map((h, i) => ({ header: h, role: roles[i] }));
      signature = headers.map((h) => norm(h)).filter(Boolean).sort().join("|");
    }
    const siteColIdx = roles.findIndex((r) => r === "site");
    const sheetLabel = title || stripSheetPrefix(sheet) || null;

    for (const row of rows) {
      if (!row.some((c) => c != null && String(c).trim() !== "")) continue;
      n++;
      const rec: CanonicalRecord = {
        row: n, site_name: null, date: null, time: null,
        fields: { rainfall: null, observed_weather: null, condition: null, temperature_c: null, salinity_ppt: null },
        context: {}, measurements: [], errors: [],
      };
      const rowSite = siteColIdx >= 0 ? String(row[siteColIdx] ?? "").trim() : "";
      rec.site_name = rowSite || sheetLabel;
      roles.forEach((role, i) => {
        const cell = row[i];
        if (role === "date") rec.date = toDateStr(cell);
        else if (role === "time") rec.time = toTimeStr(cell);
        else if (role === "ignore" || role === "site") { /* skip */ }
        else if (role.startsWith("measure:")) {
          const pv = parseValue(cell);
          if (pv.raw !== "") {
            const id = role.slice(8);
            rec.measurements.push({ test_type_id: id, test_name: types.find((t) => t.id === id)?.test_name ?? id, ...pv });
          }
        } else if (role.startsWith("field:")) {
          const f = role.slice(6) as keyof CanonicalRecord["fields"];
          if (f === "observed_weather") rec.fields.observed_weather = cell == null ? null : String(cell).trim() || null;
          else if (f === "condition") { const s = String(cell ?? "").trim().toLowerCase(); rec.fields.condition = s.startsWith("w") ? "wet" : s.startsWith("d") ? "dry" : null; }
          else rec.fields[f] = parseNum(cell);
        } else if (role === "context") { if (cell != null && String(cell).trim() !== "") rec.context[slug(headers[i])] = String(cell).trim(); }
      });
      if (!rec.date) rec.errors.push("missing or unrecognised date");
      if (!rec.measurements.length) rec.errors.push("no measurement values in row");
      records.push(rec);
    }
  }
  const siteNames = [...new Set(records.map((r) => r.site_name).filter((s): s is string => !!s))];
  return { records, columns, siteNames, headerSignature: signature };
}

export function detectFormat(filename: string): "xlsx" | "csv" | null {
  const f = filename.toLowerCase();
  return f.endsWith(".xlsx") ? "xlsx" : f.endsWith(".csv") ? "csv" : null;
}
