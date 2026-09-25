// The UK Parliament petition River Hub backs as its primary call to action.
//
// One national petition drives signatures from every River Hub instance — the ask ("publish a
// fix-by date and yearly progress for every storm overflow") is the same everywhere, and pooling
// signatures toward the 10,000 / 100,000 thresholds beats splitting them across per-instance
// petitions. So this is a shared constant, not per-instance env.
//
// PETITION_ID is the number in the petition's URL (petition.parliament.uk/petitions/<id>). It can be
// set as soon as the petition is submitted, even while it is still in moderation: getPetition() reads
// the public JSON, which 302-redirects until Parliament publishes the petition, so the CTA stays in
// its "coming" state and activates on its own the moment it goes live — no second deploy needed.

export const PETITION_ID: string | null = "782896";

export const PETITION_URL = PETITION_ID
  ? `https://petition.parliament.uk/petitions/${PETITION_ID}`
  : null;

// Thresholds are fixed by the petitions system.
export const RESPONSE_THRESHOLD = 10_000; // Government must respond
export const DEBATE_THRESHOLD = 100_000; // considered for debate

export type PetitionState = { signatureCount: number };

// Reads the petition's public JSON. Returns null while it is still in moderation (the endpoint
// 302-redirects to the moderation page until it is published) or on any error, so callers can treat
// "non-null" as "live and signable". Cached 15 minutes so a traffic spike doesn't hammer the API.
export async function getPetition(): Promise<PetitionState | null> {
  if (!PETITION_ID) return null;
  try {
    const res = await fetch(`https://petition.parliament.uk/petitions/${PETITION_ID}.json`, {
      next: { revalidate: 900 },
      redirect: "manual", // a redirect means it is not published yet
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { attributes?: { signature_count?: number } } };
    const n = json.data?.attributes?.signature_count;
    return typeof n === "number" ? { signatureCount: n } : null;
  } catch {
    return null;
  }
}
