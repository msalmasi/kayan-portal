/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kayan Forest brand palette — deep, natural greens
        kayan: {
          50: "#f0f7f2",
          100: "#d9ebe0",
          200: "#b3d7c1",
          300: "#7dba97",
          400: "#4e9a6d",
          500: "#2d5f3f",
          600: "#1a3c2a",
          700: "#142e20",
          800: "#0f2218",
          900: "#0a1610",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
