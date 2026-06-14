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
      },
      letterSpacing: { brand: '0.28em' },
    },
  },
  plugins: [],
};

export default config;
