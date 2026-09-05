#!/usr/bin/env node
// River Hub — run the data-consistency checks on demand and pretty-print the result.
//
// This is a thin client for the /api/cron/data-check route (the same code Vercel Cron runs daily), so
// there is no separate copy of the checks to drift. It just calls the endpoint and formats the report.
//
//   CRON_SECRET=… node scripts/check_data_consistency.mjs                 # against prod (Dart)
//   CHECK_URL=https://<teign-domain> CRON_SECRET=… node scripts/check_data_consistency.mjs
//   CHECK_URL=http://localhost:3000 CRON_SECRET=… node scripts/check_data_consistency.mjs   # dev
//
// CRON_SECRET must match the deployment's env var (read from .env.local if present). Exits non-zero if
// any check fails, so it doubles as a CI/pre-deploy gate.

import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const BASE = (process.env.CHECK_URL || "https://riverhub.friendsofthedart.org").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("Set CRON_SECRET (it must match the deployment's env var). Read from .env.local if present.");
  process.exit(2);
}

const res = await fetch(`${BASE}/api/cron/data-check`, { headers: { authorization: `Bearer ${SECRET}` } });
if (res.status === 401) {
  console.error("401 Unauthorized — CRON_SECRET does not match the deployment.");
  process.exit(2);
}
const body = await res.json().catch(() => ({}));
if (!Array.isArray(body.results)) {
  console.error(`Unexpected response (HTTP ${res.status}):`, JSON.stringify(body).slice(0, 300));
  process.exit(2);
}

console.log(`\nRiver Hub data consistency — ${BASE}  (${body.ranAt})\n`);
for (const r of body.results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);
console.log(`\n${body.passed}/${body.passed + body.failed} passed${body.failed ? ` — ${body.failed} FAILED` : ""}.\n`);
process.exit(body.failed ? 1 : 0);
