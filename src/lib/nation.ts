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
  /** Its plural: "parishes" / "communities" */
  councilAreas: string;
  /** The council above it: "District" / "County" (Wales's principal councils) */
  districtLabel: string;
  /** The regulator's WhatDoTheyKnow body slug, for information requests */
  wdtkSlug: string;
  /** "the EA" / "NRW": the short name mid-sentence */
  the: string;
  /** "The EA" / "NRW": the short name starting a sentence */
  The: string;
  /** "The Environment Agency" / "Natural Resources Wales": the full name starting a sentence */
  TheName: string;
  /** Where the annual spill figures come from, for source lines */
  edmSource: string;
  /** The regulator's water-quality archive, for source lines */
  wqSource: string;
  /** Rainfall data behind the dry-spill test, for source lines */
  rainSource: string;
  /** "Environment Agency rain gauge" / "NRW rain gauge" */
  gaugeLabel: string;
  /** The public register of discharge permits */
  permitRegisterUrl: string;
  /** The first day of discharge-by-discharge spill history, where it starts late: Wales has no
   *  published start/stop files, so its history begins with River Hub's own hourly snapshots of the
   *  water company's live feed. Null for England (the EA's files go back to 2024 and earlier). */
  spillHistoryFrom: string | null;
};

const REGULATORS: Record<Nation, Regulator> = {
  england: {
    name: "Environment Agency",
    nameInSentence: "the Environment Agency",
    short: "EA",
    programme: "WINEP",
    programmeName: "Water Industry National Environment Programme",
    councilArea: "parish",
    councilAreas: "parishes",
    districtLabel: "District",
    wdtkSlug: "environment_agency",
    the: "the EA",
    The: "The EA",
    TheName: "The Environment Agency",
    edmSource: "Environment Agency EDM annual returns",
    wqSource: "Environment Agency Water Quality Archive",
    rainSource: "Environment Agency rainfall and flow data (Hydrology and flood-monitoring APIs)",
    gaugeLabel: "Environment Agency rain gauge",
    permitRegisterUrl: "https://environment.data.gov.uk/public-register/view/search-water-discharge-consents",
    spillHistoryFrom: null,
  },
  wales: {
    name: "Natural Resources Wales",
    nameInSentence: "Natural Resources Wales",
    short: "NRW",
    programme: "NEP",
    programmeName: "National Environment Programme",
    councilArea: "community",
    councilAreas: "communities",
    districtLabel: "County",
    wdtkSlug: "natural_resources_wales",
    the: "NRW",
    The: "NRW",
    TheName: "Natural Resources Wales",
    edmSource: "Dŵr Cymru Welsh Water EDM annual returns to Natural Resources Wales",
    wqSource: "Natural Resources Wales Open Water Quality Archive",
    rainSource: "Natural Resources Wales telemetry rainfall data",
    gaugeLabel: "NRW rain gauge",
    permitRegisterUrl: "https://publicregister.naturalresources.wales/",
    spillHistoryFrom: "2026-11-28",
  },
};

/** "28 November 2026": a spillHistoryFrom date in words. */
export function historyDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

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
