/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      colors: {
        background: "hsl(var(--bg))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        muted: "hsl(var(--muted))"
      },
      boxShadow: { soft: "0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)" },
      transitionTimingFunction: { "ease-out-custom": "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      transitionDuration: { fast: "150ms", base: "200ms", slow: "250ms" }
    }
  },
  plugins: []
};
