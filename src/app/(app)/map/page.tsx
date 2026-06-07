import { createClient } from "@/lib/supabase/server";
import { MapClient } from "@/components/MapClient";
import type { MapSite, MapAsset } from "@/components/MapView";
import type { EdmSnapshot } from "@/lib/types";

export default async function MapPage() {
  const supabase = await createClient();

  const [{ data: sites }, { data: assets }, { data: snaps }] = await Promise.all([
    supabase.from("test_sites").select("id, name, latitude, longitude"),
    supabase.from("sewage_assets").select("id, asset_name, latitude, longitude"),
    supabase.from("edm_snapshots").select("asset_id, status, snapshot_date").order("captured_at", { ascending: false }),
  ]);

  const latest = new Map<string, number | null>();
  for (const s of (snaps as Pick<EdmSnapshot, "asset_id" | "status" | "snapshot_date">[]) ?? []) {
    if (!latest.has(s.asset_id)) latest.set(s.asset_id, s.status);
  }

  const mapSites: MapSite[] = ((sites as { id: string; name: string; latitude: number | null; longitude: number | null }[]) ?? [])
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.latitude!, lng: s.longitude! }));

  const mapAssets: MapAsset[] = ((assets as { id: string; asset_name: string; latitude: number | null; longitude: number | null }[]) ?? [])
    .filter((a) => a.latitude != null && a.longitude != null)
    .map((a) => ({ id: a.id, name: a.asset_name, lat: a.latitude!, lng: a.longitude!, status: latest.get(a.id) ?? null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Map</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <Legend colour="#1d7c8c" label="Testing site" />
          <Legend colour="#16a34a" label="Asset — not spilling" />
          <Legend colour="#dc2626" label="Asset — spilling" />
          <Legend colour="#d97706" label="Asset — offline" />
          <Legend colour="#9ca3af" label="Asset — no data" />
        </div>
      </div>

      {!mapSites.length && !mapAssets.length ? (
        <p className="text-sm text-gray-500">
          No mapped locations yet. Add coordinates to sites or assets to see them here.
        </p>
      ) : (
        <MapClient sites={mapSites} assets={mapAssets} />
      )}
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: colour }} />
      {label}
    </span>
  );
}
