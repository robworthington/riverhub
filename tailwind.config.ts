import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Members' scale, re-pointed at the public palette (Nov 2026 restyle): river-700 links are the
        // public teal, river-500/600 actions the brand navy, river-50/100 fills the navy tints.
        river: {
          50: "#F1F6FA",
          100: "#E8EEF3",
          200: "#C3CFD9",
          500: "#1B4468",
          600: "#12314B",
          700: "#0d6b62",
          800: "#094a44",
        },
        // Public "Explore" redesign palette (see PUBLIC-SITE-REDESIGN.md). Namespaced under `rh`
        // so it never collides with the members-side `river`/default Tailwind colours.
        rh: {
          ink: "#101b1d",
          ink2: "#4b5c5e", // body copy
          ink3: "#6c7c7e", // notes / sublines
          quiet: "#93a0a1",
          label: "#647375",
          paper: "#f4f2ec",
          card: "#fffdf8",
          cardAlt: "#f0ede4",
          well: "#eae6db",
          line: "#ddd8cc",
          lineSoft: "#e6e2d7",
          rowDiv: "#efece2",
          rowHover: "#f7f4ea",
          teal: "#0d6b62", // OK / links / not-spilling
          tealDeep: "#094a44",
          alarm: "#b8342a", // spilling now
          alarmDeep: "#a02a20",
          alarmTint: "#fff6f4",
          amber: "#c07a12", // stopped recently / stale feed / watchlist
          // live-status markers (Yealm feedback, Nov 2026): spilling-now is brighter and bigger with a
          // halo; spilled-in-48h is a lighter gold with a dark outline, so the two differ in lightness
          // as well as hue (colour-blind and greyscale safe). Text keeps alarm/amber for contrast.
          live: "#d7261e",
          recent: "#f2a93b",
          recentRing: "#6b4400",
          dry: "#6b4a8f", // dry spill
          dryDeep: "#55337c",
          prestw: "#9a4415", // spilled before its works
          wet: "#7c94a6", // permitted wet-weather spill
          nodata: "#7d8a8c",
          // panel/chip tints (regulatory restructure) — previously inlined in the pages
          dryPanel: "#f5f0fa",
          dryPanelBorder: "#d3c3e4",
          prestwPanel: "#fdf1ea",
          prestwPanelBorder: "#e6c4ad",
          chipAmberBg: "#fdf7ec",
          chipAmberBorder: "#e6cfa4",
          chipTealBg: "#eef7f9",
          chipTealBorder: "#b9d9de",
          alarmBorder: "#e8b6ae",
          alarmDivider: "#ecd3ce",
        },
        // Public chrome rebrand (design_handoff_riverhub_header / _intro): navy + serif editorial
        // system for the header, page-header band, campaign pages and Donate. Data components keep `rh`.
        brand: {
          navy: "#1B4468", // utility strip, active rule, primary buttons
          navyDeep: "#12314B", // headings, wordmark, dark panels
          body: "#3C5566", // body copy on light
          text: "#14293C", // default text
          muted: "#6B7C8C", // eyebrow
          label: "#7A8B99", // band label / captions
          placeholder: "#8B9AA6",
          band: "#F3F6F9", // page-header band
          surface: "#F7F9FB",
          surfaceSel: "#F1F6FA", // selected ask card
          tabIdle: "#E8EEF3",
          tabHover: "#DFE7EE",
          line: "#E7EDF1", // chrome borders
          line2: "#E1E8EE", // band / tabs / table
          line3: "#EEF2F6",
          line4: "#DCE3E9",
          line5: "#C3CFD9", // input border
          dashed: "#CBD6DE",
          onNavy: "#DCE7EF",
          onNavy2: "#C6D7E4",
          onNavy3: "#D5E3EE",
          onNavy4: "#8FB2CC",
          accent: "#A03A2B", // Donate, high figures
          accentHover: "#8A3024",
          cautionBorder: "#C9A227",
          cautionBg: "#FDF8EA",
          cautionText: "#6B5210",
          cautionText2: "#4E4318",
        },
      },
      fontFamily: {
        // Public rebrand (design_handoff_riverhub_header): Source Serif 4 for display, IBM Plex Sans
        // for UI; IBM Plex Mono kept for the data numerals. `archivo` aliased to sans for legacy uses.
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        archivo: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        plexmono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        rhPulse: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".35", transform: "scale(.82)" },
        },
        // expanding halo behind a spilling-now marker: the dot itself never dims
        rhPing: {
          "0%": { opacity: ".7", transform: "scale(1)" },
          "80%,100%": { opacity: "0", transform: "scale(2.6)" },
        },
      },
      animation: {
        "rh-pulse": "rhPulse 1.6s ease-in-out infinite",
        "rh-pulse-slow": "rhPulse 2.4s ease-in-out infinite",
        "rh-ping": "rhPing 1.6s cubic-bezier(0, 0, .2, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
