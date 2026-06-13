// Tokens de marca LuceBien. Únicos válidos. NUNCA usar #0A1628 ni #C8A24B (deprecados).
export const theme = {
  colors: {
    navy: '#2e3e6e',
    gold: '#b8a515',
  },
  fonts: {
    display: 'Cormorant Garamond, serif',
    body: 'Inter, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
} as const;

export type Theme = typeof theme;
