/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dynamic brand palette — reads from CSS variables
        // set by EntityConfigProvider at runtime
        brand: {
          50: "var(--brand-50, #f0f7f2)",
          100: "var(--brand-100, #d9ebe0)",
          200: "var(--brand-200, #b3d7c1)",
          300: "var(--brand-300, #7dba97)",
          400: "var(--brand-400, #4e9a6d)",
          500: "var(--brand-500, #2d5f3f)",
          600: "var(--brand-600, #1a3c2a)",
          700: "var(--brand-700, #142e20)",
          800: "var(--brand-800, #0f2218)",
          900: "var(--brand-900, #0a1610)",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
