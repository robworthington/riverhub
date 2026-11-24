// River photos (migration 0099): shared helpers for the members' Photos page and the public pages.

export type PhotoLicence = "cc_by_4" | "river_hub_only";
export type PhotoStatus = "pending" | "approved" | "hidden";

export const LICENCE_LABEL: Record<PhotoLicence, string> = {
  cc_by_4: "CC BY 4.0",
  river_hub_only: "River Hub use only",
};

export const LICENCE_URL: Partial<Record<PhotoLicence, string>> = {
  cc_by_4: "https://creativecommons.org/licenses/by/4.0/",
};

export const STATUS_LABEL: Record<PhotoStatus, string> = {
  pending: "Waiting for approval",
  approved: "Public",
  hidden: "Hidden",
};

/** The public bucket that holds approved photos only. */
export const PUBLIC_BUCKET = "river-photos";

/** Public URL for a file in the river-photos bucket. */
export function publicPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${PUBLIC_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Storage paths for a photo: private (evidence bucket) on upload, public (river-photos) on approval. */
export function photoPaths(orgId: string, photoId: string) {
  return {
    privateLarge: `photos/${orgId}/${photoId}/large.jpg`,
    privateThumb: `photos/${orgId}/${photoId}/thumb.jpg`,
    publicLarge: `${orgId}/${photoId}/large.jpg`,
    publicThumb: `${orgId}/${photoId}/thumb.jpg`,
  };
}

/** Reasons a visitor can give when reporting a photo (migration 0110). */
export type ReportReason = "privacy" | "wrong_place" | "not_theirs" | "offensive" | "other";
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  privacy: "A person or their home can be identified",
  wrong_place: "It isn't where it says",
  not_theirs: "It's my photo, or isn't theirs to share",
  offensive: "It's offensive or inappropriate",
  other: "Something else",
};
