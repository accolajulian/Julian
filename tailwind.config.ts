/**
 * Tailwind CSS v4 note:
 * This project uses Tailwind CSS v4, which is CSS-first. Theme configuration is
 * defined via @theme blocks in globals.css — this file is kept for tooling
 * compatibility and IDE intellisense only.
 *
 * The authoritative design tokens live in /app/globals.css.
 */
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        card: "var(--card)",
        accent: "var(--accent)",
        secondary: "var(--secondary)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        border: "var(--border)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        glow: {
          "0%, 100%": {
            boxShadow: "0 0 5px var(--accent), 0 0 20px var(--accent)",
          },
          "50%": {
            boxShadow:
              "0 0 20px var(--accent), 0 0 60px var(--accent), 0 0 100px var(--accent)",
          },
        },
        "pulse-green": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        glow: "glow 2s ease-in-out infinite",
        "pulse-green": "pulse-green 2s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
