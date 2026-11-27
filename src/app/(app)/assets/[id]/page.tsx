import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { hasAnyTask } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { memberRiver, publicPath } from "@/lib/memberRiver";
import { PermitsSection } from "@/components/PermitsSection";
import { AssetMeasuresManager, type LinkedMeasure, type AvailableMeasure } from "@/components/AssetMeasuresManager";
import { AssetPhotoUpload } from "@/components/AssetPhotoUpload";
import { assetTypeLabel } from "@/components/edm-ui";
import { getSignedUrl } from "@/lib/storage";
import type { AssetPermit, AssetPhoto, SewageAsset, SewageSystem, WaterBody } from "@/lib/types";

// "Manage this overflow" (Nov 2026): the editing tools only. Everything people read about an overflow
// (live status, spill history, dry spills, WINEP, map) is on its public page, which links here for
// members with the regulatory task. Anyone else is sent to the public page.
export default async function ManageOverflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ org?: string }> }) {
  const { id } = await params;
  const { org } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  // from a public page on another river: switch to that river first (switch_org checks membership)
  if (org && /^[0-9a-f-]{36}$/i.test(org) && org !== profile.organisation_id) {
    const { data: ok } = await supabase.rpc("switch_org" as never, { p_org: org } as never);
    if ((ok as unknown) === true) redirect(`/assets/${id}`);
  }
  const river = await memberRiver(supabase, profile.organisation_id);
  const publicHref = publicPath(river.slug, `/explore/spills/${id}`);
  if (!hasAnyTask(profile.tasks, "regulatory")) redirect(publicHref);

  const { data: asset } = await supabase.from("sewage_assets").select("*").eq("id", id).single();
  if (!asset) notFound();
  const a = asset as SewageAsset;

  const [{ data: system }, { data: waterBody }, { data: permits }, { data: photos }, { data: linksRaw }, { data: allMeasures }] =
    await Promise.all([
      a.sewage_system_id
        ? supabase.from("sewage_systems").select("id, name").eq("id", a.sewage_system_id).single()
        : Promise.resolve({ data: null }),
      a.water_body_id
        ? supabase.from("water_bodies").select("label").eq("id", a.water_body_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("asset_permits").select("*").eq("asset_id", id).order("permit_start_date"),
      supabase.from("asset_photos").select("*").eq("asset_id", id).order("created_at"),
      supabase.from("winep_asset_links").select("id, note, winep_actions(id, action_id, action_name, driver_label)").eq("asset_id", id),
      supabase.from("winep_actions").select("id, action_id, action_name, driver_label").order("action_id"),
    ]);

  const permitList = (permits as AssetPermit[]) ?? [];
  const permitDocUrl: Record<string, string | null> = {};
  await Promise.all(permitList.filter((p) => p.permit_doc_path).map(async (p) => { permitDocUrl[p.id] = await getSignedUrl(p.permit_doc_path!); }));
  const photoUrls = await Promise.all(((photos as AssetPhoto[]) ?? []).map(async (p) => ({ id: p.id, caption: p.caption, url: await getSignedUrl(p.storage_path) })));
  const linkedMeasures: LinkedMeasure[] = ((linksRaw as unknown as { id: string; note: string | null; winep_actions: { id: string; action_id: string | null; action_name: string | null; driver_label: string | null } | null }[]) ?? [])
    .map((l) => ({ id: l.id, action_ref: l.winep_actions?.action_id ?? null, action_name: l.winep_actions?.action_name ?? null, driver_label: l.winep_actions?.driver_label ?? null, note: l.note }));
  const availableMeasures: AvailableMeasure[] = ((allMeasures as { id: string; action_id: string | null; action_name: string | null; driver_label: string | null }[]) ?? [])
    .map((m) => ({ id: m.id, action_ref: m.action_id, action_name: m.action_name, driver_label: m.driver_label }));
  const sys = system as Pick<SewageSystem, "id" | "name"> | null;

  const facts: [string, React.ReactNode][] = [
    ["Type", assetTypeLabel(a.asset_type)],
    ["Outlet ID", a.asset_unique_id ?? "—"],
    ["Drains to", sys ? <Link href={`/sewage-systems/${sys.id}`} className="text-river-700 hover:underline">{sys.name}</Link> : <span className="text-amber-800">No system yet</span>],
    ["Water body", (waterBody as Pick<WaterBody, "label"> | null)?.label ?? "—"],
    ["Owner", a.asset_owner ?? "—"],
    ["Storm storage (m³)", a.storage_capacity != null ? String(a.storage_capacity) : "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-gray-500">Manage overflow</p>
          <h1 className="text-xl font-semibold">{a.asset_name}</h1>
        </div>
        <div className="flex gap-2">
          <a href={publicHref} className="btn-secondary">Public page</a>
          <Link href={`/assets/${id}/edit`} className="btn">Edit details</Link>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Its live status, spill history, dry spills and planned improvements are on the <a href={publicHref} className="text-river-700 hover:underline">public page</a>.
        This page holds what members keep up to date.
      </p>

      <div className="card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-gray-400">{k}</dt>
              <dd className="text-sm text-gray-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Permits</h2>
        <PermitsSection assetId={id} permits={permitList} docUrls={permitDocUrl} />
      </div>

      <AssetMeasuresManager assetId={id} linked={linkedMeasures} available={availableMeasures} canEdit />

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Photo</h2>
        {photoUrls.some((p) => p.url) ? (
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photoUrls.map((p) => p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt={p.caption ?? a.asset_name} className="h-28 w-full rounded-md object-cover" />
            ) : null)}
          </div>
        ) : <p className="mb-2 text-sm text-gray-500">No photo yet.</p>}
        <AssetPhotoUpload assetId={id} />
      </div>
    </div>
  );
}
