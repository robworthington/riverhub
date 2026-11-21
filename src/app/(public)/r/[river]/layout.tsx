import { use } from "react";
import { notFound } from "next/navigation";
import { primeRiverSlug, getCurrentRiver } from "@/lib/river-context";

// Validates the /r/<slug> segment and makes the river available to every nested page and data call
// for the rest of the request. The slug comes from the route param (reliable on every runtime,
// including Vercel) — not the middleware header. This layout is SYNCHRONOUS and primes the slug with
// use(params) before returning its children, so the prime happens before any child renders (an async
// layout's await yields control and lets children render first — the data then wrongly falls back to
// the default river). The async notFound gate lives in a child so the sync prime isn't deferred.
export default function RiverLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ river: string }>;
}) {
  const { river: slug } = use(params);
  primeRiverSlug(slug);
  return <RiverGate>{children}</RiverGate>;
}

async function RiverGate({ children }: { children: React.ReactNode }) {
  const river = await getCurrentRiver();
  if (!river) notFound();
  return <>{children}</>;
}
