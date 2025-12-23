/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sky-blue': '#D6E4E5',
        'sage-green': '#D9E8D8',
        'blush-pink': '#F5E1DA',
        'warm-tan': '#EFE9DF',
        'soft-gray': '#F4F6F6',
        'charcoal': '#2D3436', // Good text color for contrast
        'primary': '#0ea5e9', // Sky Blue
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Or Poppins if I import it
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      }
    },
  },
  plugins: [],
}
