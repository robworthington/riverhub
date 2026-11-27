import Link from "next/link";
import { requireTask } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReviewQueue, type PendingResult } from "@/components/ReviewQueue";

// Results waiting for review in my group (migration 0130). Needs the sampling task.
export default async function ReviewPage() {
  const me = await requireTask("sampling");
  const supabase = await createClient();
  const { data } = await supabase
    .from("test_results")
    .select("id, date_collected, result, person_collecting, created_by, test_sites(name), test_types(test_name, primary_unit)")
    .eq("status" as never, "pending" as never)
    .eq("group_id" as never, (me.active_group_id ?? "") as never)
    .order("date_collected", { ascending: true })
    .limit(500);
  const raw = (data as unknown as {
    id: string; date_collected: string; result: number | null; person_collecting: string | null; created_by: string | null;
    test_sites: { name: string } | null; test_types: { test_name: string; primary_unit: string | null } | null;
  }[]) ?? [];
  const ids = [...new Set(raw.map((r) => r.created_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map(((people as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name]));
  const rows: PendingResult[] = raw.map((r) => ({
    id: r.id, date_collected: r.date_collected, result: r.result, person_collecting: r.person_collecting,
    site: r.test_sites?.name ?? "—", test: r.test_types?.test_name ?? "—", unit: r.test_types?.primary_unit ?? null,
    entered_by: r.created_by ? name.get(r.created_by) ?? null : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Results to review</h1>
          <p className="text-sm text-gray-600">
            Results entered by people without the sampling task wait here until someone approves them. Only approved results
            appear on the public pages, in Analysis and on the maps.
          </p>
        </div>
        <Link href="/results" className="btn-secondary">All results</Link>
      </div>
      {rows.length ? <ReviewQueue rows={rows} /> : <p className="text-sm text-gray-500">Nothing waiting for review.</p>}
    </div>
  );
}
