import { redirectToPublic } from "@/lib/movedToPublic";

// The overflow list moved to the public board (Nov 2026). Members manage an overflow from its public
// page ("Manage this overflow"); overflows needing attention are on the dashboard and Systems page.
export default async function MovedAssets() {
  return redirectToPublic("/explore/spills");
}
