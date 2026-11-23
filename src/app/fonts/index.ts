import localFont from "next/font/local";

// Public + national type system: Source Serif 4 (display), IBM Plex Sans (UI), IBM Plex Mono (data
// numerals). Self-hosted (latin subset, from Fontsource; SIL OFL 1.1, licences alongside) rather than
// next/font/google: that loader fetches Google Fonts at build time, and an unexpected Google response
// fails the whole build ("Cannot read properties of null (reading '1')" in its loader), which was
// intermittently breaking Vercel deploys. Local files make the build independent of Google.
// Shared by the (public) and (national) layouts so both scope the same three CSS variables.

export const sourceSerif = localFont({
  src: [
    { path: "./source-serif-4-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./source-serif-4-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./source-serif-4-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-serif",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const plexSans = localFont({
  src: [
    { path: "./ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const plexMono = localFont({
  src: [
    { path: "./ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
