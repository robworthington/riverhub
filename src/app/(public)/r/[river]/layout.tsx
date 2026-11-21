import { notFound } from "next/navigation";
import { getCurrentRiver } from "@/lib/river-context";

// Validates the /r/<slug> segment: an unknown or not-live river 404s. The slug itself is resolved
// from the x-river-slug header set by the middleware, so nested pages share one cached lookup.
export default async function RiverLayout({ children }: { children: React.ReactNode }) {
  const river = await getCurrentRiver();
  if (!river) notFound();
  return <>{children}</>;
}
