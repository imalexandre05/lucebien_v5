import type { Config } from 'tailwindcss';

// Paleta "Atelier formal": navy dominante, oro como acento, papel cálido, tinta.
// NUNCA #0A1628 ni #C8A24B (deprecados).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#2e3e6e', dark: '#26335a', deep: '#1b2440' },
        gold: { DEFAULT: '#b8a515', soft: '#c9b84a' },
        paper: '#f6f4ef',
        ink: '#20283f',
        line: '#e6e0d4',
        muted: '#807a6c',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,36,64,0.05), 0 12px 28px -16px rgba(27,36,64,0.18)',
        lift: '0 2px 4px rgba(27,36,64,0.06), 0 20px 40px -20px rgba(27,36,64,0.30)',
      },
      letterSpacing: { brand: '0.28em' },
      transitionTimingFunction: {
        // Curva ease-out fuerte (Emil): arranca rápido, se siente responsiva.
        'out-expo': 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        rise: 'rise 360ms cubic-bezier(0.23, 1, 0.32, 1) both',
        // `backwards` (no forwards): no deja transform tras terminar → no rompe sticky/fixed hijos.
        'page-enter': 'rise 380ms cubic-bezier(0.23, 1, 0.32, 1) backwards',
        fade: 'fade 300ms ease-out both',
        'scale-in': 'scaleIn 240ms cubic-bezier(0.23, 1, 0.32, 1) both',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
