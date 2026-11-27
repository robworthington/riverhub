import Link from "next/link";
import { canEdit, requireProfile } from "@/lib/auth";
import { hasAnyTask } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { publicPhotoUrl } from "@/lib/photos";
import type { RiverPhoto } from "@/lib/types";
import { PhotoUpload } from "@/components/photos/PhotoUpload";
import { PhotoGrid, type GridPhoto } from "@/components/photos/PhotoGrid";
import { ReportedPhotos, type ReportedPhoto } from "@/components/photos/ReportedPhotos";
import { resolvePhotoReports } from "@/app/(app)/photos/actions";

export const metadata = { title: "Photos — River Hub" };

type Filter = "pending" | "approved" | "hidden";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Waiting for approval" },
  { key: "approved", label: "Public" },
  { key: "hidden", label: "Hidden" },
];

export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const orgId = profile.active_organisation_id ?? profile.organisation_id;
  const supabase = await createClient();

  const [{ data: rows }, { data: org }, { data: assets }] = await Promise.all([
    supabase.from("river_photos").select("*").order("created_at", { ascending: false }),
    supabase.from("organisations").select("name, river_name, river_slug").eq("id", orgId).single(),
    supabase.from("sewage_assets").select("id, asset_name, asset_type").eq("organisation_id", orgId).order("asset_name"),
  ]);
  const all = (rows as RiverPhoto[] | null) ?? [];
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((p) => p.status === f.key).length])) as Record<Filter, number>;
  const filter: Filter = FILTERS.some((f) => f.key === sp.f) ? (sp.f as Filter) : counts.pending > 0 || all.length === 0 ? "pending" : "approved";
  const shown = all.filter((p) => p.status === filter);

  // Pending and hidden photos only exist in the private bucket: short-lived signed links for review.
  const privateThumbs = shown.filter((p) => p.status !== "approved");
  const signed = privateThumbs.length
    ? (await supabase.storage.from("evidence").createSignedUrls(privateThumbs.flatMap((p) => [p.thumb_private_path, p.private_path]), 600)).data ?? []
    : [];
  const signedUrl = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;

  const grid: GridPhoto[] = shown.map((p) => ({
    id: p.id,
    caption: p.caption,
    place: p.place,
    takenOn: p.taken_on,
    credit: p.credit,
    licence: p.licence,
    status: p.status,
    isHero: p.is_hero,
    assetId: p.asset_id,
    mine: p.uploaded_by === profile.id,
    thumbUrl: p.status === "approved" ? publicPhotoUrl(p.thumb_public_path) : signedUrl(p.thumb_private_path),
    largeUrl: p.status === "approved" ? publicPhotoUrl(p.public_path) : signedUrl(p.private_path),
  }));

  const assetOptions = (assets ?? []).map((a) => ({ id: a.id, name: a.asset_name, type: a.asset_type }));
  const isAdmin = hasAnyTask(profile.tasks, "photos"); // approve, hero, reports

  // Open reports from the public (migration 0110), for the river's admins.
  let reported: ReportedPhoto[] = [];
  if (isAdmin) {
    const { data: reps } = await supabase
      .from("photo_reports" as never)
      .select("id, photo_id, reason, note, email, created_at")
      .eq("status" as never, "pending" as never)
      .order("created_at" as never, { ascending: false });
    const list = (reps as unknown as { id: string; photo_id: string; reason: ReportedPhoto["reports"][number]["reason"]; note: string | null; email: string | null; created_at: string }[]) ?? [];
    const photoIds = [...new Set(list.map((r) => r.photo_id))];
    const photos = all.filter((p) => photoIds.includes(p.id));
    const hiddenThumbs = photos.filter((p) => p.status !== "approved").map((p) => p.thumb_private_path);
    const repSigned = hiddenThumbs.length ? (await supabase.storage.from("evidence").createSignedUrls(hiddenThumbs, 600)).data ?? [] : [];
    reported = photos.map((p) => ({
      id: p.id,
      caption: p.caption,
      status: p.status,
      hiddenByReports: Boolean((p as { hidden_by_reports?: boolean }).hidden_by_reports),
      thumbUrl: p.status === "approved" ? publicPhotoUrl(p.thumb_public_path) : repSigned.find((x) => x.path === p.thumb_private_path)?.signedUrl ?? null,
      reports: list.filter((r) => r.photo_id === p.id),
    }));
  }
  const riverName = org?.river_name ?? org?.name ?? "your river";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Photos of the {riverName}</h1>
        <p className="max-w-3xl text-sm text-gray-500">
          Photos your group adds appear on the river&rsquo;s public pages once an admin approves them, credited and
          licensed. River Hub removes the location and camera details from every photo before it&rsquo;s stored.
          {org?.river_slug && (
            <> See them on <Link href={`/r/${org.river_slug}/explore/spills`} className="text-river-700 hover:underline">the river&rsquo;s live board</Link>.</>
          )}
        </p>
      </div>

      {reported.length > 0 && (
        <section aria-labelledby="reports-h" className="space-y-2">
          <h2 id="reports-h" className="text-sm font-semibold uppercase tracking-wide text-red-700">
            Reported by the public ({reported.length})
          </h2>
          <ReportedPhotos photos={reported} decide={resolvePhotoReports} />
        </section>
      )}

      {canEdit(profile.role) && (
        <PhotoUpload orgId={orgId} defaultCredit={org?.name ?? ""} assets={assetOptions} isAdmin={isAdmin} />
      )}

      <nav aria-label="Filter photos" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/photos?f=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${filter === f.key ? "border-river-700 bg-river-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-river-700"}`}
          >
            {f.label} <span className="ml-0.5 font-semibold">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>

      {grid.length === 0 ? (
        <p className="card text-sm text-gray-600">
          {filter === "pending" ? "Nothing waiting for approval." : filter === "approved" ? "No public photos yet." : "No hidden photos."}
        </p>
      ) : (
        <PhotoGrid photos={grid} isAdmin={isAdmin} assets={assetOptions} />
      )}
    </div>
  );
}
