import type { SupabaseClient } from "@supabase/supabase-js";
import type { WqSample } from "@/lib/riverHealth";

// Every sample at one EA sampling point. The API returns at most 1,000 rows per request and a busy
// point has several thousand (Sequers Bridge on the Erme: 3,105), so page through them.
const PAGE = 1000;

export async function fetchPointSamples(supabase: SupabaseClient, orgId: string, notation: string): Promise<WqSample[] | null> {
  const out: WqSample[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    let page: WqSample[] | null = null;
    for (let attempt = 0; attempt < 3 && page == null; attempt++) {
      const { data, error } = await supabase
        .rpc("public_wq_point_samples" as never, { p_org: orgId, p_notation: notation } as never)
        .range(from, from + PAGE - 1);
      if (!error && data) page = data as unknown as WqSample[];
      else if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
    if (page == null) return out.length ? out : null;
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}
