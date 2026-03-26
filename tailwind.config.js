/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.{ejs,html,js}",
    "./public/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        goliath: {
          bg: '#0a0a0a',
          sidebar: '#111111',
          card: '#161616',
          hover: '#1c1c1c',
          active: '#202020',
          border: '#222222',
        }
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
