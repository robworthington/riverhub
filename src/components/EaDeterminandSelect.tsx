"use client";

import { useRouter } from "next/navigation";
import { useRiverSlug, riverHref } from "@/components/public/RiverProvider";

// Determinand picker for an EA site page — navigates to ?d=<determinand> on change.
export function EaDeterminandSelect({
  notation,
  determinands,
  current,
}: {
  notation: string;
  determinands: { name: string; n: number }[];
  current: string;
}) {
  const router = useRouter();
  const slug = useRiverSlug();
  return (
    <select
      className="input max-w-md"
      value={current}
      onChange={(e) =>
        router.push(riverHref(slug, `/explore/ea-monitoring/${encodeURIComponent(notation)}?d=${encodeURIComponent(e.target.value)}`))
      }
    >
      {determinands.map((d) => (
        <option key={d.name} value={d.name}>
          {d.name} ({d.n})
        </option>
      ))}
    </select>
  );
}
