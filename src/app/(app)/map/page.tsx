import { redirectToPublic } from "@/lib/movedToPublic";

// The site & asset map moved to the public map (Nov 2026): overflows, EA water quality and published
// volunteer sites are layers there.
export default async function MovedSiteMap() {
  return redirectToPublic("/explore/spills/map#volunteer-testing");
}
