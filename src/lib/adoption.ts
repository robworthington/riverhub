// Adopt a river (migration 0107): shared vocabulary for the public form and the moderation queue.

export type AdoptionStatus = "pending" | "approved" | "rejected" | "spam";
export type GroupKind = "charity" | "community" | "club" | "council" | "education" | "other";

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  charity: "Registered charity or trust",
  community: "Community or residents' group",
  club: "Angling, rowing, swimming or paddling club",
  council: "Parish or town council",
  education: "School, college or university",
  other: "Something else",
};

export const STATUS_LABEL: Record<AdoptionStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Declined",
  spam: "Spam",
};

/** One request, as moderators see it. */
export type AdoptionRequest = {
  id: string; organisation_id: string; group_name: string; group_kind: GroupKind; charity_number: string | null;
  website: string | null; contact_name: string; contact_role: string; email: string; phone: string | null;
  about: string; how_heard: string | null; status: AdoptionStatus; moderator_note: string | null;
  decided_by: string | null; decided_at: string | null; invited_user_id: string | null; created_at: string;
};

/** Plain-English messages for the errors submit_adoption_request() raises. */
export const SUBMIT_ERROR: Record<string, string> = {
  river_not_found: "We couldn't find that river.",
  already_adopted: "A local group already looks after this river on River Hub.",
  already_pending: "You've already asked to adopt this river. We'll be in touch once it's been reviewed.",
  rate_limited: "Too many requests from here today. Please try again tomorrow, or email hello@riverhub.org.",
};

export const ADOPTION_CONTACT = "hello@riverhub.org";
