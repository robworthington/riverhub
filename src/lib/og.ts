// Shared helpers for the next/og share cards.
export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" };

// Fetch a Source Serif 4 TTF for the wordmark. Google serves a .ttf for this family, which Satori
// reads directly. Wrapped so a fetch failure just drops the custom font (the card still renders in the
// default face) rather than erroring the whole OG route.
export async function loadSerif(weight: 700 = 700): Promise<OgFont[] | undefined> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@${weight}`, {
      headers: { "User-Agent": "Mozilla/4.0" },
    }).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+\.ttf)\)/)?.[1];
    if (!url) return undefined;
    const data = await fetch(url).then((r) => r.arrayBuffer());
    return [{ name: "Source Serif 4", data, weight, style: "normal" }];
  } catch {
    return undefined;
  }
}

// Fetch one Google-hosted TTF (Satori can't read the self-hosted woff2 files). Same failure contract as
// loadSerif: a miss drops that face rather than failing the card.
async function loadGoogleFont(family: string, weight: 400 | 600 | 700): Promise<OgFont | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, {
      headers: { "User-Agent": "Mozilla/4.0" },
    }).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+\.ttf)\)/)?.[1];
    if (!url) return null;
    const data = await fetch(url).then((r) => r.arrayBuffer());
    return { name: family, data, weight, style: "normal" };
  } catch {
    return null;
  }
}

/** The three faces the live share cards use: Source Serif 4 (sentence), IBM Plex Mono (the number),
 *  IBM Plex Sans (kicker and source line). */
export async function loadCardFonts(): Promise<OgFont[] | undefined> {
  const faces = await Promise.all([
    loadGoogleFont("Source Serif 4", 700),
    loadGoogleFont("IBM Plex Mono", 700),
    loadGoogleFont("IBM Plex Sans", 400),
    loadGoogleFont("IBM Plex Sans", 700),
  ]);
  const ok = faces.filter((f): f is OgFont => f != null);
  return ok.length ? ok : undefined;
}

/** "17:58, Sun 23 Nov" in UK time: when a live figure was true. */
export function cardTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = "Europe/London";
  const time = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  return `${time}, ${day}`;
}

/** Hours since a live figure was refreshed (null when unknown). Cards follow the home banner: over 24 h
 *  the count isn't presented as current at all. */
export function liveAgeHours(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (Date.now() - t) / 3_600_000;
}

/** The line every live card carries (SAS review): a spill count says nothing about water quality. */
export const SAFETY_LINE = "A spill isn't a water-quality test.";

// ---------- photos (river photos, migration 0099) ----------

export type CardPhoto = { src: string; credit: string };

type PublicPhotoRow = { asset_id: string | null; credit: string; licence: string; public_path: string | null; is_hero: boolean };

/**
 * A photo for a share card: the overflow's own photo when there is one, otherwise the river's lead
 * photo (or its newest). The image is fetched here and embedded as a data URI, so a missing, slow or
 * oversized file gives the plain card instead of a broken one. Null when the river has no photo.
 */
export async function loadCardPhoto(orgId: string | null | undefined, assetId?: string): Promise<CardPhoto | null> {
  if (!orgId) return null;
  try {
    const { createPublicClient } = await import("@/lib/supabase/public");
    const { publicPhotoUrl, LICENCE_LABEL } = await import("@/lib/photos");
    const db = createPublicClient();
    const { data } = await db.rpc("public_river_photos" as never, { p_org: orgId } as never);
    const rows = (data as unknown as PublicPhotoRow[]) ?? [];
    const pick = (assetId && rows.find((r) => r.asset_id === assetId)) || rows.find((r) => r.is_hero) || rows[0];
    const url = publicPhotoUrl(pick?.public_path);
    if (!pick || !url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4_000_000) return null;
    const licence = LICENCE_LABEL[pick.licence as keyof typeof LICENCE_LABEL];
    return {
      src: `data:${type.split(";")[0]};base64,${Buffer.from(buf).toString("base64")}`,
      credit: `Photo: ${pick.credit}${pick.licence === "cc_by_4" && licence ? ` · ${licence}` : ""}`,
    };
  } catch {
    return null;
  }
}
