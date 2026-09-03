// Display-only tidying of the raw water-company outlet names. The DB keeps the raw strings
// (e.g. "KILBURY STW_SSO_BUCKFASTLEIGH", "STAVERTON_STW_STAVERTON"); these helpers turn them into
// readable labels without losing the outlet-type code that gives an outlet its identity.
//
// Anatomy of a raw name:  <SITE + site-type>_<OUTLET CODE>_<TOWN>
//   site-type: STW (treatment works) | SPS/SPST (pumping station)
//   outlet code: CSO | SO | SSO | PSCSO | PSCSOEO | PSEO | EO — see OUTLET_CODE_META
// Emergency-overflow names use spaces instead of underscores ("BLACKROCK SPS PSEO BUCKFAST").

export type OverflowParts = {
  site: string; // cleaned site label, e.g. "Kilbury STW", "Warfleet Creek pumping station"
  town: string | null; // cleaned town, null when redundant with the site
  code: string | null; // raw outlet code, uppercased, e.g. "SSO"
  display: string; // "site" or "site, town" — the plain-text label (no code chip)
};

// For each outlet code: a compact chip (`short`), a short human phrase (`kind`, for a subtitle),
// and the full plain-English meaning (`label`, used as the chip's hover tooltip).
export const OUTLET_CODE_META: Record<string, { short: string; kind: string; label: string }> = {
  CSO: { short: "CSO", kind: "Combined sewer overflow", label: "Combined sewer overflow — storm relief on a combined foul + surface-water sewer" },
  SO: { short: "SO", kind: "Storm overflow", label: "Storm overflow at the treatment works" },
  SSO: { short: "SSO", kind: "Storm sewage overflow", label: "Storm sewage overflow — a separate storm outlet at the treatment works" },
  PSCSO: { short: "PS-CSO", kind: "Pumping-station overflow", label: "Combined sewer overflow at a pumping station" },
  PSCSOEO: { short: "PS-CSO/EO", kind: "Pumping-station / emergency overflow", label: "Pumping-station outlet serving as both a combined sewer overflow and an emergency overflow" },
  PSEO: { short: "EO", kind: "Emergency overflow", label: "Emergency overflow at a pumping station — should discharge only when a pump fails" },
  EO: { short: "EO", kind: "Emergency overflow", label: "Emergency overflow — should discharge only when the works or a pump fails" },
};

// The short human phrase for whatever outlet code a raw name carries (falls back to a generic phrase).
export function overflowKindLabel(raw: string | null | undefined, type?: string | null): string {
  const { code } = parseOverflow(raw, type);
  if (code && OUTLET_CODE_META[code]) return OUTLET_CODE_META[code].kind;
  return "Storm overflow";
}

const SITE_TYPE = new Set(["STW", "SPS", "SPST"]);
const SMALL = new Set(["in", "the", "of", "on", "at", "to"]);

// Title-case a name fragment: keep "STW" upright, expand SPS/SPST to "pumping station",
// leave numbers alone, lower-case connective words. Handles "ST" as "St".
function titleCaseFragment(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  words.forEach((w, i) => {
    const up = w.toUpperCase();
    if (up === "STW") { out.push("STW"); return; }
    if (up === "SPS" || up === "SPST") { out.push("pumping", "station"); return; }
    if (/^\d+$/.test(w)) { out.push(w); return; }
    const lower = w.toLowerCase();
    if (i > 0 && SMALL.has(lower)) { out.push(lower); return; }
    out.push(lower.charAt(0).toUpperCase() + lower.slice(1));
  });
  return out.join(" ");
}

function knownCode(tok: string): boolean {
  return Object.prototype.hasOwnProperty.call(OUTLET_CODE_META, tok.toUpperCase());
}

// Split a raw outlet name into {site, code, town}, handling both the underscore form
// (storm overflows) and the space form (emergency overflows).
function split(raw: string): { site: string; code: string | null; town: string | null } {
  if (raw.includes("_")) {
    const parts = raw.split("_").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const town = parts[parts.length - 1];
      const maybeCode = parts[parts.length - 2];
      if (knownCode(maybeCode)) return { site: parts.slice(0, -2).join(" "), code: maybeCode, town };
      return { site: parts.slice(0, -1).join(" "), code: null, town };
    }
    if (parts.length === 2) {
      if (knownCode(parts[1])) return { site: parts[0], code: parts[1], town: null };
      return { site: parts[0], code: null, town: parts[1] };
    }
    return { site: parts[0] ?? raw, code: null, town: null };
  }
  // space form: find the code token, site is before it, town after
  const words = raw.trim().split(/\s+/);
  const ci = words.findIndex(knownCode);
  if (ci >= 0) {
    return {
      site: words.slice(0, ci).join(" "),
      code: words[ci],
      town: words.slice(ci + 1).join(" ") || null,
    };
  }
  return { site: raw, code: null, town: null };
}

export function parseOverflow(raw: string | null | undefined, type?: string | null): OverflowParts {
  if (!raw) return { site: "—", town: null, code: null, display: "—" };
  const { site: rawSite, code, town: rawTown } = split(raw);
  const site = titleCaseFragment(rawSite) || raw;
  let town = rawTown ? titleCaseFragment(rawTown) : null;
  // drop the town when it is already implied by the site (e.g. "Harberton STW" + "Harberton")
  if (town && site.toLowerCase().includes(town.toLowerCase())) town = null;
  // fall back to the asset_type for the code when the name carries none
  let outletCode = code ? code.toUpperCase() : null;
  if (!outletCode && type) {
    if (type === "combined_sewer_overflow") outletCode = "CSO";
    else if (type === "pumping_station") outletCode = "PSCSO";
  }
  const display = town ? `${site}, ${town}` : site;
  return { site, town, code: outletCode, display };
}

// Plain-text label (site + town, no code) — for map tooltips, <title>, etc.
export function overflowLabel(raw: string | null | undefined, type?: string | null): string {
  return parseOverflow(raw, type).display;
}

// Tidy a works / system label: "STAVERTON_STW_STAVERTON" → "Staverton STW", "BUCKFASTLEIGH STW" → "Buckfastleigh STW".
export function prettyWorksName(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = raw.replace(/_/g, " ");
  const m = s.match(/^(.*?\bSTW)\b/i); // keep everything up to and including STW, drop a repeated town
  return titleCaseFragment(m ? m[1] : s) || raw;
}
