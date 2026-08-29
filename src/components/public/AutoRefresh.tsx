"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Periodically re-render the (ISR) page so relative times update and any newly-revalidated live
// status is picked up. Cadence is hourly (decision 2), so a modest interval is plenty.
export function AutoRefresh({ minutes = 10 }: { minutes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(1, minutes) * 60_000);
    return () => clearInterval(id);
  }, [router, minutes]);
  return null;
}
