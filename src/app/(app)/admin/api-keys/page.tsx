import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ApiKeysManager } from "@/components/ApiKeysManager";
import type { ApiKey } from "@/lib/types";

export default async function ApiKeysPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("api_keys")
    .select("id, name, key_prefix, last_used_at, revoked, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">API keys</h1>
        <Link href="/admin/users" className="btn-secondary">Users</Link>
      </div>
      <p className="text-sm text-gray-500">
        Keys authenticate the results import API (<code>POST /api/import/results</code>). A key grants
        write access to this organisation&rsquo;s results — treat it like a password. The full key is
        shown only once, when created.
      </p>
      <div className="card">
        <ApiKeysManager
          keys={(data as Pick<ApiKey, "id" | "name" | "key_prefix" | "last_used_at" | "revoked" | "created_at">[]) ?? []}
        />
      </div>
    </div>
  );
}
