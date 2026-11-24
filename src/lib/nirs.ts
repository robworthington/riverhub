// Environment Agency pollution incidents (NIRS2): download and parse the open dataset.
//
// "Environmental Pollution Incidents (Category 1 and 2)" is published as a ZIP holding a Microsoft
// Access database with two tables: EP_Incidents_Nirs2 (one row per incident) and EP_Pollutants_Nirs2
// (one row per pollutant per incident). mdb-reader reads the .accdb in pure JavaScript (~0.1 s for the
// whole of England), so the weekly cron can run on Vercel with no external tools.
//
// Licence: Environment Agency Conditional Licence. Attribution (as the dataset specifies):
export { NIRS_ATTRIBUTION, NIRS_DATASET_URL } from "@/lib/incidents";
const DOWNLOAD_URL =
  "https://environment.data.gov.uk/api/file/download?fileDataSetId=a5a11813-517a-478b-be89-4acdf2c1f105&fileName=Environmental_Pollution_Incidents.zip";

export type NirsRow = {
  id: number; at: string | null; e: number | null; n: number | null; ngr: string | null;
  region: string | null; area: string | null; county: string | null; district: string | null;
  water: string | null; land: string | null; air: string | null; types: string[]; pollutants: string[];
};

type IncidentRecord = {
  NOT_ID: number; NOT_DATE: Date | null; X_CONF: number | null; Y_CONF: number | null; NGR_CONF: string | null;
  REGION_WM: string | null; AREA_WM: string | null; COUNTY: string | null; DISTRICT: string | null;
  EIL_WATER: string | null; EIL_LAND: string | null; EIL_AIR: string | null;
};
type PollutantRecord = { NOT_ID: number; POLL_TYPE: string | null; POLLUTANT: string | null };

const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Access stores the recorded local time; mdb-reader hands it back as if UTC. Keep the wall-clock value. */
const wallClock = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace("T", " ") : null);

export async function downloadNirs(): Promise<NirsRow[]> {
  const res = await fetch(DOWNLOAD_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`EA download failed: HTTP ${res.status}`);
  const zipBytes = new Uint8Array(await res.arrayBuffer());
  return parseNirsZip(zipBytes);
}

export async function parseNirsZip(zipBytes: Uint8Array): Promise<NirsRow[]> {
  const [{ unzipSync }, { default: MDBReader }] = await Promise.all([import("fflate"), import("mdb-reader")]);
  const files = unzipSync(zipBytes);
  const name = Object.keys(files).find((f) => f.toLowerCase().endsWith(".accdb") || f.toLowerCase().endsWith(".mdb"));
  if (!name) throw new Error("The EA download didn't contain an Access database.");
  const db = new MDBReader(Buffer.from(files[name]));
  const tables = db.getTableNames();
  if (!tables.includes("EP_Incidents_Nirs2") || !tables.includes("EP_Pollutants_Nirs2")) {
    throw new Error(`Unexpected tables in the EA download: ${tables.join(", ")}`);
  }

  const byId = new Map<number, { types: Set<string>; pollutants: Set<string> }>();
  for (const p of db.getTable("EP_Pollutants_Nirs2").getData() as unknown as PollutantRecord[]) {
    const entry = byId.get(p.NOT_ID) ?? { types: new Set<string>(), pollutants: new Set<string>() };
    const t = clean(p.POLL_TYPE);
    const n = clean(p.POLLUTANT);
    if (t) entry.types.add(t);
    if (n) entry.pollutants.add(n);
    byId.set(p.NOT_ID, entry);
  }

  return (db.getTable("EP_Incidents_Nirs2").getData() as unknown as IncidentRecord[])
    .filter((i) => Number.isInteger(i.NOT_ID))
    .map((i) => {
      const pol = byId.get(i.NOT_ID);
      return {
        id: i.NOT_ID,
        at: wallClock(i.NOT_DATE),
        e: typeof i.X_CONF === "number" ? Math.round(i.X_CONF) : null,
        n: typeof i.Y_CONF === "number" ? Math.round(i.Y_CONF) : null,
        ngr: clean(i.NGR_CONF),
        region: clean(i.REGION_WM),
        area: clean(i.AREA_WM),
        county: clean(i.COUNTY),
        district: clean(i.DISTRICT),
        water: clean(i.EIL_WATER),
        land: clean(i.EIL_LAND),
        air: clean(i.EIL_AIR),
        types: [...(pol?.types ?? [])],
        pollutants: [...(pol?.pollutants ?? [])],
      };
    });
}

// Display helpers live in src/lib/incidents.ts (safe for client components); re-exported here.
export { SEWAGE_POLLUTANT_LABEL } from "@/lib/incidents";
