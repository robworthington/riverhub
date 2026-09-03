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
