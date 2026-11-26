import type { SupabaseClient } from "@supabase/supabase-js";
import { INSTANCE } from "@/lib/instance";

// The river a signed-in member is working on (profile.organisation_id from requireProfile(), i.e. the
// river they have switched to), for member pages and emails that used the build-time INSTANCE
// branding. On the national deploy INSTANCE is always the default river; this reads the member's own.
export type MemberRiver = { groupName: string; riverName: string; mapCentre: [number, number]; mapZoom: number };

export async function memberRiver(supabase: SupabaseClient, orgId: string): Promise<MemberRiver> {
  const { data } = await supabase
    .from("organisations")
    .select("name, river_name, map_centre_lat, map_centre_lng, map_zoom")
    .eq("id", orgId)
    .maybeSingle();
  const o = data as { name: string | null; river_name: string | null; map_centre_lat: number | null; map_centre_lng: number | null; map_zoom: number | null } | null;
  return {
    groupName: o?.name ?? INSTANCE.orgName,
    riverName: o?.river_name ?? INSTANCE.riverName,
    mapCentre: o?.map_centre_lat != null && o?.map_centre_lng != null ? [o.map_centre_lat, o.map_centre_lng] : [...INSTANCE.mapCentre],
    mapZoom: o?.map_zoom ?? INSTANCE.mapZoom,
  };
}
