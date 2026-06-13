import type { Config } from 'tailwindcss';

// Tokens navy/gold. Espejo de @scilb/adapter-lucebien/theme. NUNCA #0A1628 ni #C8A24B.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { navy: '#2e3e6e', gold: '#b8a515' },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
