import { requireModerator } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { publicPhotoUrl } from "@/lib/photos";
import { ReportedPhotos, type ReportedPhoto } from "@/components/photos/ReportedPhotos";
import { moderatePhotoReports } from "@/app/(app)/admin/photo-reports/actions";

// River Hub moderators: open photo reports on every river (migration 0110). Each river's admins see
// their own on the Photos page; this is the backstop, especially for rivers without a group.
export const dynamic = "force-dynamic";

type Rep = { id: string; photo_id: string; reason: ReportedPhoto["reports"][number]["reason"]; note: string | null; email: string | null; created_at: string };
type Photo = { id: string; organisation_id: string; caption: string; status: string; hidden_by_reports: boolean; thumb_public_path: string | null; thumb_private_path: string };

export default async function PhotoReportsPage() {
  await requireModerator();
  const supabase = await createClient();
  const { data } = await supabase
    .from("photo_reports" as never)
    .select("id, photo_id, reason, note, email, created_at")
    .eq("status" as never, "pending" as never)
    .order("created_at" as never, { ascending: false });
  const reps = (data as unknown as Rep[]) ?? [];

  // Photos and river names across rivers: moderators can't read other rivers' rows under RLS.
  const admin = createAdminClient();
  const ids = [...new Set(reps.map((r) => r.photo_id))];
  const { data: ph } = ids.length ? await admin.from("river_photos").select("*").in("id", ids) : { data: [] };
  const photos = (ph as unknown as Photo[]) ?? [];
  const orgIds = [...new Set(photos.map((p) => p.organisation_id))];
  const { data: orgs } = orgIds.length ? await admin.from("organisations").select("id, river_name").in("id", orgIds) : { data: [] };
  const riverOf = new Map(((orgs as { id: string; river_name: string | null }[]) ?? []).map((o) => [o.id, o.river_name ?? "River"]));
  const hidden = photos.filter((p) => p.status !== "approved").map((p) => p.thumb_private_path);
  const signed = hidden.length ? (await admin.storage.from("evidence").createSignedUrls(hidden, 600)).data ?? [] : [];

  const list: ReportedPhoto[] = photos.map((p) => ({
    id: p.id,
    caption: p.caption,
    status: p.status,
    hiddenByReports: p.hidden_by_reports,
    riverName: riverOf.get(p.organisation_id),
    thumbUrl: p.status === "approved" ? publicPhotoUrl(p.thumb_public_path) : signed.find((s) => s.path === p.thumb_private_path)?.signedUrl ?? null,
    reports: reps.filter((r) => r.photo_id === p.id),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Photo reports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Photos the public has reported, on every river. A privacy report, or three reports from different people,
          takes a photo down straight away until someone keeps or hides it. Each river&rsquo;s admins see their own
          reports on their Photos page too.
        </p>
      </div>
      {list.length === 0 ? (
        <p className="card text-sm text-gray-600">No open reports.</p>
      ) : (
        <ReportedPhotos photos={list} decide={moderatePhotoReports} />
      )}
    </div>
  );
}
