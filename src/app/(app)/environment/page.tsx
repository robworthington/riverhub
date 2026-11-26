import { redirectToPublic } from "@/lib/movedToPublic";

// Moved to the public Rain and river flow page (the admin sync button is on the dashboard).
export default async function MovedEnvironment() {
  return redirectToPublic("/explore/spills/why/rain");
}
