import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#07111f",
          panel: "#0b1626",
          panel2: "#0f1d31",
          border: "#22314a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
