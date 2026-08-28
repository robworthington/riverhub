import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        river: {
          50: "#eef7f9",
          100: "#d6ecf0",
          500: "#1d7c8c",
          600: "#176577",
          700: "#124f5e",
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
          dry: "#6b4a8f", // dry spill
          dryDeep: "#55337c",
          prestw: "#9a4415", // spilled before its works
          wet: "#7c94a6", // permitted wet-weather spill
          nodata: "#7d8a8c",
        },
      },
      fontFamily: {
        archivo: ["var(--font-archivo)", "system-ui", "sans-serif"],
        plexmono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        rhPulse: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".35", transform: "scale(.82)" },
        },
      },
      animation: {
        "rh-pulse": "rhPulse 1.6s ease-in-out infinite",
        "rh-pulse-slow": "rhPulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
