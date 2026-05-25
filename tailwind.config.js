/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#08090b',
          panel: '#0d0e12',
          surface: '#13151a',
          raised: '#1a1c24',
          overlay: '#1f212a',
        },
        ink: {
          DEFAULT: '#f5f5f7',
          muted: '#c4c7cf',
          faint: '#8b8f9a',
          subtle: '#5c606b',
          dim: '#363a44',
        },
        brand: {
          DEFAULT: '#635bff',
          hover: '#7c75ff',
          pressed: '#4f47e6',
          ring: 'rgba(99,91,255,0.35)',
          glow: 'rgba(99,91,255,0.15)',
        },
        success: {
          DEFAULT: '#22c55e',
          muted: 'rgba(34,197,94,0.15)',
          border: 'rgba(34,197,94,0.25)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: 'rgba(245,158,11,0.12)',
          border: 'rgba(245,158,11,0.22)',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239,68,68,0.12)',
          border: 'rgba(239,68,68,0.22)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        // Stripe-inspired multi-layer shadows, adapted for dark surfaces
        'card': '0 0 0 1px rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.32)',
        'card-hover': '0 0 0 1px rgba(255,255,255,0.10), 0 4px 8px rgba(0,0,0,0.28), 0 12px 32px rgba(0,0,0,0.40)',
        'floating': '0 0 0 1px rgba(255,255,255,0.08), 0 4px 6px -2px rgba(0,0,0,0.3), 0 16px 40px -8px rgba(0,0,0,0.4), 0 30px 60px -12px rgba(99,91,255,0.06)',
        'glow': '0 0 0 1px rgba(99,91,255,0.2), 0 0 24px rgba(99,91,255,0.12), 0 4px 8px rgba(0,0,0,0.2)',
        'inset': 'inset 0 1px 0 0 rgba(255,255,255,0.04), inset 0 -1px 0 0 rgba(0,0,0,0.2)',
        'ring': '0 0 0 3px rgba(99,91,255,0.25)',
        'sm': '0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.2)',
      },
      borderRadius: {
        'xs': '2px',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
