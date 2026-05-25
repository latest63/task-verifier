/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Linear-inspired palette
        canvas: {
          DEFAULT: '#08090a',
          panel: '#0f1011',
          surface: '#191a1b',
          elevated: '#28282c',
        },
        ink: {
          DEFAULT: '#f7f8f8',
          muted: '#d0d6e0',
          faint: '#8a8f98',
          subtle: '#62666d',
        },
        accent: {
          DEFAULT: '#5e6ad2',
          violet: '#7170ff',
          hover: '#828fff',
          lavender: '#7a7fad',
        },
        success: {
          DEFAULT: '#27a644',
          emerald: '#10b981',
        },
        border: {
          subtle: 'rgba(255,255,255,0.05)',
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: '#23252a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}
