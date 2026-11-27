import { redirectToPublic } from "@/lib/movedToPublic";

// The pollution heat map was removed (Nov 2026): EA results graded against the standards are on the
// public map's water-quality layer and River health; volunteer sites are a map layer by class.
export default async function MovedHeatMap() {
  return redirectToPublic("/explore/spills/map#water-quality");
}
