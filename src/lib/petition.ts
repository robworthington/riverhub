// The UK Parliament petition River Hub backs as its primary call to action.
//
// One national petition drives signatures from every River Hub instance — the ask ("publish a
// fix-by date and yearly progress for every storm overflow") is the same everywhere, and pooling
// signatures toward the 10,000 / 100,000 thresholds beats splitting them across per-instance
// petitions. So this is a shared constant, not per-instance env.
//
// SET PETITION_ID once the petition is live on petition.parliament.uk (the number in its URL, e.g.
// petition.parliament.uk/petitions/700123 → "700123"). Until it is set, <PetitionCta> renders
// nothing, so no dead "sign" button appears before the petition exists.

export const PETITION_ID: string | null = null; // e.g. "700123"

export const PETITION_URL = PETITION_ID
  ? `https://petition.parliament.uk/petitions/${PETITION_ID}`
  : null;

// Thresholds are fixed by the petitions system.
export const RESPONSE_THRESHOLD = 10_000; // Government must respond
export const DEBATE_THRESHOLD = 100_000; // considered for debate

// Live signature count from the petition's public JSON API. Cached for 15 minutes so a traffic
// spike doesn't hammer the API; returns null if the petition isn't set or the fetch fails, and the
// CTA degrades to the ask + sign button without a counter.
export async function getSignatureCount(): Promise<number | null> {
  if (!PETITION_ID) return null;
  try {
    const res = await fetch(`https://petition.parliament.uk/petitions/${PETITION_ID}.json`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { attributes?: { signature_count?: number } } };
    const n = json.data?.attributes?.signature_count;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}
