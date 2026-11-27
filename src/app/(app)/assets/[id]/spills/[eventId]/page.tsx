import { redirectToPublic } from "@/lib/movedToPublic";

// Moved to the public spill dossier (Nov 2026): same evidence, printable, shareable.
export default async function MovedSpillDossier({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  return redirectToPublic(`/explore/spills/${id}/events/${eventId}`);
}
