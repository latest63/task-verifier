/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#faf9ff',
          surface: '#ffffff',
          raised: '#f5f3ff',
          overlay: '#ede9fe',
        },
        ink: {
          DEFAULT: '#1e1b4b',
          muted: '#4b4569',
          faint: '#6b6785',
          subtle: '#9b97b5',
          dim: '#c4c0d4',
        },
        brand: {
          DEFAULT: '#7c3aed',
          light: '#a855f7',
          glow: '#c084fc',
          soft: '#ede9fe',
          hover: '#6d28d9',
        },
        accent: {
          pink: '#ec4899',
          blue: '#3b82f6',
          cyan: '#06b6d4',
          orange: '#f97316',
        },
        success: {
          DEFAULT: '#10b981',
          soft: '#d1fae5',
          border: '#a7f3d0',
        },
        warning: {
          DEFAULT: '#f59e0b',
          soft: '#fef3c7',
          border: '#fde68a',
        },
        danger: {
          DEFAULT: '#ef4444',
          soft: '#fee2e2',
          border: '#fecaca',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0,0,0,0.04)',
        'sm': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card': '0 0 0 1px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(124,58,237,0.06)',
        'card-hover': '0 0 0 1px rgba(124,58,237,0.15), 0 4px 12px rgba(0,0,0,0.08), 0 12px 32px rgba(124,58,237,0.10)',
        'floating': '0 0 0 1px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.08), 0 24px 48px rgba(124,58,237,0.08)',
        'glow': '0 0 0 2px rgba(124,58,237,0.2), 0 0 32px rgba(124,58,237,0.15), 0 4px 8px rgba(124,58,237,0.1)',
        'ring': '0 0 0 3px rgba(124,58,237,0.2)',
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)',
        'brand-gradient-hover': 'linear-gradient(135deg, #6d28d9 0%, #9333ea 50%, #a855f7 100%)',
        'hero-glow': 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.08) 0%, transparent 60%)',
        'card-glow': 'radial-gradient(ellipse 100% 100% at 0% 0%, rgba(124,58,237,0.04) 0%, transparent 50%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.25s ease-out',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        pulseGlow: { '0%, 100%': { boxShadow: '0 0 20px rgba(124,58,237,0.1)' }, '50%': { boxShadow: '0 0 40px rgba(124,58,237,0.2)' } },
      },
    },
  },
  plugins: [],
}
