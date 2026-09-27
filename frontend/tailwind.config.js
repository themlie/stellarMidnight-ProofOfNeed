/** @type {import('tailwindcss').Config} */
export default {
  // Classes are also built in src/*.ts template strings, so those are scanned too.
  content: ['./*.html', './src/**/*.ts'],
  theme: { extend: {} },
  plugins: [],
};
