import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Paleta "Atelier formal": navy dominante, oro como acento, papel cálido, tinta.
// NUNCA #0A1628 ni #C8A24B (deprecados).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#2e3e6e', dark: '#26335a', deep: '#1b2440' },
        // `soft` es el oro luminoso del manual (§6, "Gold Claro"), no el apagado que había antes:
        // se usa en hover, y un hover que baja la saturación se siente como que algo se apagó.
        // `deep` es el "Gold Oscuro" del manual, el único gold que se puede leer como texto sobre
        // fondo claro. Reemplaza al #7a6e0e que estaba escrito a mano en veinte lugares.
        gold: { DEFAULT: '#b8a515', soft: '#d4bf1e', deep: '#8a7c10' },
        paper: '#f6f4ef',
        ink: '#20283f',
        line: '#e6e0d4',
        muted: '#807a6c',

        // ── Semánticos ────────────────────────────────────────────────────────────────────
        //
        // Salen del manual de marca §6 y NO de la paleta por defecto de Tailwind. Hasta ahora el
        // ERP usaba emerald/amber/red sueltos —seiscientas apariciones en 67 archivos— y eso tenía
        // dos costos: los verdes y ámbares de Tailwind son fríos al lado del navy y del oro, y
        // cada pantalla elegía su propio tono, así que "correcto" no se veía igual en dos lugares.
        //
        // Cuatro pasos por familia, y cada uno tiene un trabajo:
        //   soft → fondo del aviso            line → su borde
        //   DEFAULT → el punto, la barra, el relleno      deep → el texto encima de `soft`
        //
        // `deep` sobre `soft` pasa 4.5:1 en las cuatro familias; DEFAULT es para superficie, no
        // para texto largo.
        exito: { soft: '#eaf6f0', line: '#bfe3d1', DEFAULT: '#2d9e6b', deep: '#1d6b48' },
        aviso: { soft: '#fdf3e3', line: '#f5d9a8', DEFAULT: '#e08c1a', deep: '#95590a' },
        error: { soft: '#fcecec', line: '#f2c3c3', DEFAULT: '#c94040', deep: '#992d2d' },
        info: { soft: '#eaf2fa', line: '#bcd7ee', DEFAULT: '#3a7fc1', deep: '#255a8f' },
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
        // Barras de datos que crecen desde la base (usar con `origin-bottom`). Solo transform.
        growY: {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        // "Hilo" que se enhebra de izquierda a derecha (usar con `origin-left`). Solo transform.
        drawX: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      // DURACIONES. Una animación de interfaz se queda por debajo de 300ms: a partir de ahí deja
      // de sentirse como respuesta y empieza a sentirse como espera. Las que había —rise 360,
      // grow-y 480, draw-x 700— estaban arriba de ese techo sin ninguna razón que las sostenga.
      // La curva es la misma de siempre, que ya era la correcta (ease-out fuerte).
      animation: {
        rise: 'rise 280ms cubic-bezier(0.23, 1, 0.32, 1) both',
        // `backwards` (no forwards): no deja transform tras terminar → no rompe sticky/fixed hijos.
        'page-enter': 'rise 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards',
        // El ease-out del navegador es demasiado flojo para leerse como intención. Misma curva
        // que el resto del sistema.
        fade: 'fade 220ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'scale-in': 'scaleIn 240ms cubic-bezier(0.23, 1, 0.32, 1) both',
        // Movimiento constante: lineal. Con una curva, el barrido acelera y frena, y un
        // esqueleto que titubea parece que se colgó.
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        'grow-y': 'growY 280ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'drawer-in': 'slideInLeft 240ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'draw-x': 'drawX 260ms cubic-bezier(0.23, 1, 0.32, 1) 120ms both',
      },
    },
  },
  plugins: [
    // `hover-fine:` — hover SÓLO donde hay un puntero de verdad.
    //
    // En una pantalla táctil, tocar dispara un :hover que se queda pegado hasta el próximo toque
    // en otro lado. Con un color eso se nota poco; con un transform la tarjeta queda levantada y
    // el sistema parece roto. En LuceBien la mitad del uso es de pie y con el celular, así que no
    // es un caso de borde.
    //
    // Se usa sólo para MOVIMIENTO. Los hovers de color se dejan sin gatear: un color pegado no
    // engaña a nadie y en un híbrido —una laptop táctil— se pierde la señal si se gatea de más.
    plugin(({ addVariant }) => {
      addVariant('hover-fine', '@media (hover: hover) and (pointer: fine) { &:hover }');
      addVariant('group-hover-fine', '@media (hover: hover) and (pointer: fine) { :merge(.group):hover & }');
    }),
  ],
};

export default config;
