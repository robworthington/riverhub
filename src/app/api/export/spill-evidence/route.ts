import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSpillEvidence } from "@/lib/spill-evidence";

export const dynamic = "force-dynamic";

// Immutable, downloadable evidence snapshot for one spill (DRY-SPILL-UX-PROPOSAL.md §D).
// Returns the exact same evidence the dossier renders, as a self-contained JSON the user can keep
// — frozen at download time (generatedAt + methodVersion baked in), so a submitted record is
// reproducible even if upstream data is later revised. RLS scopes to the caller's org.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const eventId = request.nextUrl.searchParams.get("event");
  if (!eventId) return new Response("missing ?event", { status: 400 });

  const evidence = await getSpillEvidence(supabase, eventId);
  if (!evidence) return new Response("Not found", { status: 404 });

  return new Response(JSON.stringify(evidence, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="spill-evidence-${evidence.asset.uniqueId ?? eventId}-${evidence.event.start.slice(0, 10)}.json"`,
    },
  });
}
