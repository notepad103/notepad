/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        macBlue: '#0A84FF'
      },
      boxShadow: {
        floating: '0 8px 24px rgba(15, 23, 42, 0.1), 0 2px 8px rgba(15, 23, 42, 0.06)'
      }
    }
  },
  plugins: []
};
