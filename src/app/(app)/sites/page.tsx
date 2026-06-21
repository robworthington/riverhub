import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TestSite } from "@/lib/types";

type Row = {
  key: string; name: string; source: "FoD" | "EA"; href: string;
  detail: string; extra: string;
};

export default async function SitesPage() {
  const supabase = await createClient();
  const [{ data: sites }, { data: eaSites }] = await Promise.all([
    supabase.from("test_sites").select("*").order("name"),
    supabase.rpc("public_ea_wq_sites"),
  ]);

  const rows: Row[] = [];
  for (const s of (sites as TestSite[]) ?? []) {
    rows.push({ key: `c-${s.id}`, name: s.name, source: "FoD", href: `/sites/${s.id}`,
      detail: labelType(s.type), extra: s.tidal ? "Tidal" : "" });
  }
  for (const e of (eaSites as { notation: string; site_label: string | null; wb_name: string | null; n_samples: number }[]) ?? []) {
    rows.push({ key: `e-${e.notation}`, name: e.site_label ?? e.notation, source: "EA",
      href: `/explore/ea-monitoring/${encodeURIComponent(e.notation)}`,
      detail: e.wb_name ?? "—", extra: `${(e.n_samples ?? 0).toLocaleString()} samples` });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Testing sites</h1>
        <Link href="/sites/new" className="btn">Add site</Link>
      </div>
      <p className="text-sm text-gray-500">
        Friends-of-the-Dart citizen sites and Environment Agency monitoring points. EA points open the
        EA monitoring view (regulator data, kept separate from your own samples).
      </p>

      {!rows.length ? (
        <p className="text-sm text-gray-500">No sites yet. Add your first testing site.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Type / water body</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={r.href} className="font-medium text-river-700 hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.source === "EA" ? "bg-indigo-100 text-indigo-700" : "bg-river-100 text-river-800"
                    }`}>{r.source}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{r.detail}</td>
                  <td className="px-4 py-2 text-gray-500">{r.extra || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function labelType(t: TestSite["type"]) {
  if (t === "bathing_water") return "Bathing water";
  if (t === "community_designated") return "Community designated";
  return "—";
}
