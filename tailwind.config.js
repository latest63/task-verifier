/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#fdfdf8',
          surface: '#eeefe9',
          raised: '#e5e7e0',
          warm: '#d4c9b8',
        },
        ink: {
          DEFAULT: '#4d4f46',
          deep: '#23251d',
          muted: '#65675e',
          faint: '#9ea096',
        },
        border: {
          DEFAULT: '#bfc1b7',
          light: '#b6b7af',
        },
        brand: {
          DEFAULT: '#1e3a5f',
          hover: '#162d4a',
          dark: '#1e3a5f',
        },
        focus: '#3b82f6',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'deep': '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'sm': '0 1px 3px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        'xs': '2px',
        'sm': '4px',
        'md': '6px',
      },
    },
  },
  plugins: [],
}
