/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        sidebar: {
          bg:      "#166534",   /* deep green */
          hover:   "#15803d",   /* slightly lighter */
          active:  "#14532d",   /* darkest green for active pill */
          border:  "#15803d",
          text:    "#bbf7d0",   /* mint text */
          muted:   "#86efac",   /* section labels */
          heading: "#dcfce7",
        },
      },
      boxShadow: {
        card: "0 1px 4px 0 rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.04)",
      },
    },
  },
  plugins: [],
};
