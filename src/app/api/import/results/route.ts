import { createHash } from "crypto";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { loadResults, type ImportRecord } from "@/lib/import/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function presentedKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}

export async function POST(req: NextRequest) {
  const key = presentedKey(req);
  if (!key) return json({ ok: false, error: "Missing API key (Authorization: Bearer <key>)." }, 401);

  const admin = createAdminClient();
  const hash = createHash("sha256").update(key).digest("hex");
  const { data: keyRow } = await admin.from("api_keys")
    .select("id, organisation_id, revoked").eq("key_hash", hash).maybeSingle();
  if (!keyRow || (keyRow as { revoked: boolean }).revoked) return json({ ok: false, error: "Invalid or revoked API key." }, 401);
  const orgId = (keyRow as { organisation_id: string }).organisation_id;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Body must be JSON." }, 400); }
  const records = (Array.isArray(body) ? body : (body as { records?: unknown }).records) as ImportRecord[] | undefined;
  if (!Array.isArray(records)) return json({ ok: false, error: "Expected a JSON array, or { records: [...] }." }, 400);
  if (records.length > 5000) return json({ ok: false, error: "Too many records (max 5000 per request)." }, 413);

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", (keyRow as { id: string }).id);

  const result = await loadResults(admin, orgId, records, "api");
  return json(result, result.ok ? 200 : result.imported > 0 ? 207 : 400);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
