import { redirectToPublic } from "@/lib/movedToPublic";

// Moved to the public council pages (same paths under /explore/councils).
export default async function MovedCouncils({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  const tail = (rest ?? []).map(encodeURIComponent).join("/");
  return redirectToPublic(`/explore/councils${tail ? `/${tail}` : ""}`);
}
