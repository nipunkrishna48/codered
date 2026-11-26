/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#07070b",
        surface: "#0d0e14",
        panel: "#12131c",
        elevated: "#181a26",
        borderSubtle: "rgba(255, 255, 255, 0.08)",
        violetAccent: "#8b5cf6",
        purpleGlow: "#a855f7",
        goldAccent: "#eab308",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
