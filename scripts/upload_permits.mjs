// Upload matched permit PDFs to the private 'evidence' bucket via @supabase/supabase-js (which
// speaks the new sb_secret_… API-key format), then emit the asset_permits insert SQL for psql.
// Drop-in alternative to import_permits.py for projects on the new API-key system, whose storage
// gateway rejects the secret key when passed as a raw Bearer token.
//
//   cd <river-hub>
//   export SUPABASE_URL="https://<ref>.supabase.co"
//   export SUPABASE_SERVICE_KEY="sb_secret_..."         # new secret key is fine here
//   export PERMITS_DIR="/abs/path/to/permits"
//   node scripts/upload_permits.mjs --config config/catchments/dart.json --manifest config/dart_permits.json > /tmp/permits.sql
//   docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 < /tmp/permits.sql
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const log = (...a) => console.error(...a);
const here = path.dirname(fileURLToPath(import.meta.url));

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!URL_ || !KEY) { log("set SUPABASE_URL and SUPABASE_SERVICE_KEY"); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync(arg("--config", path.join(here, "..", "config", "catchments", "dart.json"))));
const manifest = JSON.parse(fs.readFileSync(arg("--manifest", path.join(here, "..", "config", `${cfg.name}_permits.json`))));
const permitsDir = process.env.PERMITS_DIR || path.join(here, "..", "permits");
const org = cfg.org_id;

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const q = (v) => (v === null || v === undefined || v === "" ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const numlit = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? "null" : String(Number(v)));

const uploaded = [];
for (const r of manifest) {
  const src = path.join(permitsDir, r.file);
  if (!fs.existsSync(src)) { log(`-- MISSING FILE, skipped: ${r.file}`); continue; }
  const obj = `assets/${r.uid}/permits/${String(r.permit_number).replace(/\//g, "-")}.pdf`;
  const { error } = await sb.storage.from("evidence").upload(obj, fs.readFileSync(src), {
    contentType: "application/pdf", upsert: true,
  });
  if (error) { log(`-- UPLOAD FAILED ${r.file}: ${error.message || JSON.stringify(error)}`); continue; }
  uploaded.push({ ...r, obj });
  log(`-- uploaded ${r.permit_number} -> ${obj}`);
}

const orgl = q(org) + "::uuid";
const out = [
  `-- River Hub: SWW permits for ${cfg.river} (uploaded via supabase-js). Idempotent.`,
  "begin;",
  `delete from asset_permits where organisation_id = ${orgl} and permit_doc_path like 'assets/%/permits/%' and asset_id in (select id from sewage_assets where organisation_id = ${orgl});`,
];
for (const r of uploaded) {
  out.push(
    "insert into asset_permits (organisation_id, asset_id, permit_number, permit_start_date, " +
    "required_storage_capacity, permit_dwf_m3d, permit_fft_m3d, permit_pe, permit_doc_path)\n" +
    `select ${orgl}, sa.id, ${q(r.permit_number)}, ${q(r.issued)}, ${numlit(r.storage_m3)}, ` +
    `${numlit(r.dwf)}, ${numlit(r.fft_m3d)}, ${r.pe ? parseInt(r.pe) : "null"}, ${q(r.obj)}\n` +
    `from sewage_assets sa where sa.organisation_id = ${orgl} and sa.asset_unique_id = ${q(r.uid)};`,
  );
}
out.push(`select 'asset_permits now: ' || count(*) from asset_permits where organisation_id = ${orgl};`);
out.push(`select 'with a flow value: ' || count(*) from asset_permits where organisation_id = ${orgl} and (permit_dwf_m3d is not null or permit_fft_m3d is not null or required_storage_capacity is not null);`);
out.push("commit;");
console.log(out.join("\n"));
log(`-- uploaded ${uploaded.length} PDFs, ${manifest.length - uploaded.length} skipped`);
