/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Inter"', '"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        code: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        /* Indonesia Re Corporate Blue Scale (mapped to both brand & teal for seamless UI consistency) */
        brand: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#0664D0",
          600: "#0664D0",
          700: "#0556B5",
          800: "#194E82",
          900: "#17365D",
        },
        teal: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#3B82F6",
          500: "#0664D0",
          600: "#0664D0",
          700: "#0556B5",
          800: "#194E82",
          900: "#17365D",
        },
        sidebar: {
          bg:      "#17365D",   /* Indonesia Re deep navy blue */
          surface: "#194E82",   /* secondary corporate blue */
          hover:   "#1E4976",   /* subtle hover state */
          active:  "#0664D0",   /* primary brand blue */
          border:  "#234B7A",
          text:    "#DBEAFE",
          muted:   "#93C5FD",
          heading: "#EFF6FF",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.035), 0 4px 12px -2px rgba(15, 23, 42, 0.025)",
        "card-hover": "0 2px 6px rgba(15, 23, 42, 0.045), 0 10px 24px -4px rgba(15, 23, 42, 0.055)",
      },
    },
  },
  plugins: [],
};
