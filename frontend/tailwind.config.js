/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#0a0a0f',
          800: '#0f0f1a',
          700: '#13131f',
          600: '#1a1a2e',
        },
        glass: 'rgba(255,255,255,0.05)',
        accent: {
          DEFAULT: '#d92d2a',
          light: '#f0524e',
          glow: 'rgba(217,45,42,0.3)',
          50: '#fff1f0',
        },
        brand: {
          blue: '#3b82f6',
          teal: '#14b8a6',
          red:  '#ef4444',
          amber: '#f59e0b',
          green: '#22c55e',
        },
        txt: {
          primary: '#f1f5f9',
          muted:   '#94a3b8',
          faint:   '#475569',
        },
        border: {
          dim:   'rgba(255,255,255,0.08)',
          glass: 'rgba(255,255,255,0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: { glass: '12px', strong: '20px' },
      boxShadow: {
        glass:  '0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        glow:   '0 0 24px rgba(217,45,42,0.35)',
        'glow-sm': '0 0 12px rgba(217,45,42,0.2)',
        card:   '0 8px 32px rgba(0,0,0,0.5)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fade-in 0.3s ease-out',
        'slide-up':   'slide-up 0.4s ease-out',
        'dots':       'dots 1.4s infinite both',
      },
      keyframes: {
        'pulse-glow': {
          '0%,100%': { boxShadow: '0 0 8px rgba(217,45,42,0.2)' },
          '50%':     { boxShadow: '0 0 24px rgba(217,45,42,0.5)' },
        },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'dots': { '0%,80%,100%': { opacity: 0 }, '40%': { opacity: 1 } },
      },
    },
  },
  plugins: [],
}
