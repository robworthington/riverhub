import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { P_ORG_RPCS } from "@/lib/supabase/pOrgRpcs";
import { getCurrentRiver } from "@/lib/river-context";

// Cache a heavy public RPC's result (default 10 min) so a traffic spike is served from the data cache
// instead of running the full-catchment aggregate against Postgres on every request. Under concurrency
// those queries hit the anon statement timeout and return null, which pages render as misleading zeros
// (and latency blows out). Used for pages that must stay dynamic — chiefly the board, which reads the
// ?period= search param. One retry covers a transient timeout; on total failure we throw rather than
// cache an empty result, so the data cache keeps the last good value (stale-while-revalidate).
export async function cachedRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
  revalidate = 600,
): Promise<T[]> {
  // Org-scope to the current river before caching (headers() can't be read inside unstable_cache, so
  // resolve here and fold p_org into the args and the cache key below). Per-river cache entries.
  if (P_ORG_RPCS.has(fn) && args.p_org === undefined) {
    const river = await getCurrentRiver();
    if (river) args = { ...args, p_org: river.orgId };
  }
  const load = unstable_cache(
    async (): Promise<T[]> => {
      const supabase = createPublicClient();
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.rpc(fn as never, args as never);
        if (!error && data != null) return data as unknown as T[];
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
      throw new Error(`public RPC ${fn} returned no data`);
    },
    ["public-rpc", fn, JSON.stringify(args)],
    { revalidate, tags: ["public-rpc", fn] },
  );
  return load();
}
