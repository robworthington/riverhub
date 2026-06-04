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
      },
    },
  },
  plugins: [],
};

export default config;
