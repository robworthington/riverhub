import { redirectToPublic } from "@/lib/movedToPublic";

// Moved to the public rain gauge page.
export default async function MovedRainStation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return redirectToPublic(`/explore/spills/why/rain/${encodeURIComponent(id)}`);
}
