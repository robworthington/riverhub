import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SyncNowButton } from "@/components/SyncNowButton";
import { StatusBadge, assetTypeLabel } from "@/components/edm-ui";
import type { SewageAsset, EdmSnapshot, AssetType } from "@/lib/types";

const TYPES: { value: AssetType; label: string }[] = [
  { value: "combined_sewer_overflow", label: "Combined sewer overflow" },
  { value: "sewage_treatment_works", label: "Sewage treatment works" },
  { value: "pumping_station", label: "Pumping station" },
  { value: "storm_tank", label: "Storm tank" },
];

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; parish?: string; water_body?: string; type?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();

  // filter option lists: only parishes / water bodies that actually have assets
  const { data: refRows } = await supabase.from("sewage_assets").select("parish_id, water_body_id");
  const parishIds = [...new Set(((refRows as { parish_id: string | null }[]) ?? []).map((r) => r.parish_id).filter(Boolean))] as string[];
  const wbIds = [...new Set(((refRows as { water_body_id: string | null }[]) ?? []).map((r) => r.water_body_id).filter(Boolean))] as string[];
  const [{ data: parishes }, { data: waterBodies }] = await Promise.all([
    parishIds.length
      ? supabase.from("parishes").select("id, name, county").in("id", parishIds).order("name")
      : Promise.resolve({ data: [] }),
    wbIds.length
      ? supabase.from("water_bodies").select("id, label").in("id", wbIds).order("label")
      : Promise.resolve({ data: [] }),
  ]);
  const parishList = (parishes as { id: string; name: string; county: string }[]) ?? [];
  const wbList = (waterBodies as { id: string; label: string }[]) ?? [];
  const parishName = new Map(parishList.map((p) => [p.id, p.name]));
  const wbName = new Map(wbList.map((w) => [w.id, w.label]));

  // filtered asset query
  let query = supabase.from("sewage_assets").select("*").order("asset_name");
  const term = sp.q?.trim();
  if (term) {
    const safe = term.replace(/[,()*]/g, " ");
    query = query.or(`asset_name.ilike.%${safe}%,asset_unique_id.ilike.%${safe}%`);
  }
  if (sp.parish) query = query.eq("parish_id", sp.parish);
  if (sp.water_body) query = query.eq("water_body_id", sp.water_body);
  if (sp.type) query = query.eq("asset_type", sp.type as AssetType);

  const [{ data: assets }, { data: snaps }] = await Promise.all([
    query,
    supabase.from("edm_snapshots").select("asset_id, status, snapshot_date").order("captured_at", { ascending: false }),
  ]);
  const assetList = (assets as SewageAsset[]) ?? [];

  const latest = new Map<string, number | null>();
  for (const s of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
    if (!latest.has(s.asset_id)) latest.set(s.asset_id, s.status);
  }

  const filtered = !!(term || sp.parish || sp.water_body || sp.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sewage assets</h1>
        <Link href="/assets/new" className="btn">Add asset</Link>
      </div>

      {profile.role === "admin" && (
        <div className="card">
          <SyncNowButton />
        </div>
      )}

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">Search</label>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name or outlet ID…"
            className="input"
          />
        </div>
        <Filter label="Parish" name="parish" value={sp.parish}>
          <option value="">All parishes</option>
          {parishList.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.county})</option>
          ))}
        </Filter>
        <Filter label="Water body" name="water_body" value={sp.water_body}>
          <option value="">All water bodies</option>
          {wbList.map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </Filter>
        <Filter label="Type" name="type" value={sp.type}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Filter>
        <button type="submit" className="btn">Apply</button>
        {filtered && <Link href="/assets" className="btn-secondary">Reset</Link>}
      </form>

      {!assetList.length ? (
        <p className="text-sm text-gray-500">{filtered ? "No assets match these filters." : "No assets yet."}</p>
      ) : (
        <>
          <p className="text-xs text-gray-400">{assetList.length} asset{assetList.length === 1 ? "" : "s"}{filtered ? " (filtered)" : ""}</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Parish</th>
                  <th className="px-4 py-2">Water body</th>
                  <th className="px-4 py-2">Outlet ID</th>
                  <th className="px-4 py-2">Latest status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assetList.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/assets/${a.id}`} className="font-medium text-river-700 hover:underline">
                        {a.asset_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{assetTypeLabel(a.asset_type)}</td>
                    <td className="px-4 py-2 text-gray-500">{a.parish_id ? parishName.get(a.parish_id) ?? "—" : "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{a.water_body_id ? wbName.get(a.water_body_id) ?? "—" : "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{a.asset_unique_id ?? "—"}</td>
                    <td className="px-4 py-2">
                      {latest.has(a.id) ? <StatusBadge status={latest.get(a.id)!} /> : <span className="text-gray-400">No data</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} defaultValue={value ?? ""} className="input">
        {children}
      </select>
    </div>
  );
}
