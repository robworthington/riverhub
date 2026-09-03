import type { SupabaseClient } from "@supabase/supabase-js";

// Heavy public RPCs occasionally hit the anon statement timeout under DB contention and come back
// null. On an ISR page a single such null gets cached as an empty render for the whole revalidate
// window (the "0 of 0" / stale-empty bug). Retry a few times with a short backoff so a transient
// timeout recovers before the page renders, instead of caching a broken empty result.
//
// `required: true` is for data that must never legitimately be empty on a live instance (the core
// spill/measure lists). If every retry still fails, throw rather than return [] so that an ISR
// revalidation discards the failed render and Next keeps serving the last good page — the cache is
// never poisoned with an empty render. Leave it off for RPCs that can genuinely be empty (e.g.
// emergency overflows on an instance with no EO data), where [] is a real state the page renders.
//
// The throw is suppressed during `next build`: a transient DB hiccup at build time must not block a
// deploy. A build-time empty is self-healing — the first ISR revalidation that succeeds replaces it,
// and any that fails is discarded (last-good kept), so a good page is never overwritten by an empty.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function publicRpc<T = unknown>(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
  opts: { required?: boolean } = {},
): Promise<T[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc(name as never, args as never);
    if (!error && data != null) return data as T[];
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  if (opts.required && !IS_BUILD) {
    // Runtime revalidation failed: throw so ISR keeps the last good page instead of caching empty.
    throw new Error(`publicRpc: ${name} failed after retries`);
  }
  // Gave up after retries (rare). Return empty so the page's own empty state renders rather than
  // throwing; the next revalidation will try again.
  return [] as T[];
}
