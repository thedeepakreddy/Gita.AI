import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-dim": "hsl(var(--accent-dim) / <alpha-value>)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
      },
    },
  },
  plugins: [],
};
export default config;
