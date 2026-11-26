import { redirectToPublic } from "@/lib/movedToPublic";

// Moved to the public Dry spilling page.
export default async function MovedDrySpills() {
  return redirectToPublic("/explore/spills/why/dry");
}
