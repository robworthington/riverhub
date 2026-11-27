/**
 * Which nation a river is in, and the wording that follows from it (WALES-ROLLOUT-PLAN.md §4).
 *
 * England and Wales have different regulators and improvement programmes. Pages that name them use
 * these helpers with the river's `nation` (organisations.nation, migration 0135) instead of writing
 * "Environment Agency" or "WINEP" into the text. A missing nation means England: every river loaded
 * before 0135 is English, and rows from an older RPC simply lack the field.
 */

export type Nation = "england" | "wales";

export function asNation(v: string | null | undefined): Nation {
  return v === "wales" ? "wales" : "england";
}

export type Regulator = {
  /** "Environment Agency" / "Natural Resources Wales" */
  name: string;
  /** "the Environment Agency" / "Natural Resources Wales", for use mid-sentence */
  nameInSentence: string;
  /** "EA" / "NRW" */
  short: string;
  /** "WINEP" / "NEP" */
  programme: string;
  /** "Water Industry National Environment Programme" / "National Environment Programme" */
  programmeName: string;
  /** The smallest council area pages group by: "parish" / "community" */
  councilArea: string;
};

const REGULATORS: Record<Nation, Regulator> = {
  england: {
    name: "Environment Agency",
    nameInSentence: "the Environment Agency",
    short: "EA",
    programme: "WINEP",
    programmeName: "Water Industry National Environment Programme",
    councilArea: "parish",
  },
  wales: {
    name: "Natural Resources Wales",
    nameInSentence: "Natural Resources Wales",
    short: "NRW",
    programme: "NEP",
    programmeName: "National Environment Programme",
    councilArea: "community",
  },
};

export function regulatorFor(nation: string | null | undefined): Regulator {
  return REGULATORS[asNation(nation)];
}

const NATION_NAMES: Record<Nation, string> = { england: "England", wales: "Wales" };

export function nationName(nation: string | null | undefined): string {
  return NATION_NAMES[asNation(nation)];
}

/** How national pages name their coverage: "England" while every live river is English, "England and
 *  Wales" once a Welsh river is live. `nations` comes from national_nations() (migration 0135). */
export function coverageName(nations: readonly string[] | null | undefined): string {
  const set = new Set((nations?.length ? nations : ["england"]).map(asNation));
  if (set.has("england") && set.has("wales")) return "England and Wales";
  return set.has("wales") ? "Wales" : "England";
}

/** "England’s rivers" while coverage is England; "rivers in England and Wales" once it isn't (the
 *  possessive of "England and Wales" reads badly). Capitalise the first letter for a heading. */
export function riversOf(coverage: string, capitalise = false): string {
  const s = coverage === "England" ? "England\u2019s rivers" : `rivers in ${coverage}`;
  return capitalise ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** A river's display name with its Welsh name where it has one: "River Teifi (Afon Teifi)". */
export function riverDisplayName(name: string | null | undefined, nameCy: string | null | undefined): string {
  const en = name ?? "";
  if (!nameCy || nameCy.trim() === "" || nameCy.trim() === en.trim()) return en;
  return `${en} (${nameCy.trim()})`;
}
