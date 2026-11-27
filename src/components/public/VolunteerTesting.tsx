import { CLASS_COLOUR, type BathingClass } from "@/lib/bathing";

// Shared bits for the public volunteer-testing pages (migration 0132).

export function ClassBadge({ klass }: { klass: string | null }) {
  const k = (klass ?? "Insufficient data") as BathingClass;
  const colour = k !== "Insufficient data" ? CLASS_COLOUR[k] : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-rh-ink2">
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />
      {k}
    </span>
  );
}

export function VolunteerCaveat({ group }: { group?: { name: string; slug: string } | null }) {
  return (
    <p className="text-[12.5px] leading-[1.55] text-rh-ink3">
      These are volunteers&rsquo; own samples{group ? <> by <a href={`/g/${group.slug}`} className="hover:underline">{group.name}</a></> : ""}, checked by
      the group before they appear here. They are not accredited laboratory results and are not the Environment
      Agency&rsquo;s. The class uses the bathing-water method on culture tests (E. coli and intestinal enterococci) and needs
      at least 10 samples; other methods are listed but don&rsquo;t count towards it. Results are offered under{" "}
      <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener" className="hover:underline">CC BY 4.0</a>:
      reuse them freely, crediting the group and River Hub.
    </p>
  );
}

export const fmtDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
