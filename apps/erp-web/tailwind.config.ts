import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Paleta "Atelier formal": navy dominante, oro como acento, papel cálido, tinta.
// NUNCA #0A1628 ni #C8A24B (deprecados).
//
// Segunda pasada visual (docs/superpowers/specs/2026-09-06-sistema-visual-sci-lb-design.md):
// los tokens viven una sola vez en app/globals.css como canales RGB (`--navy: 46 62 110`), y
// este archivo los deriva con `t()`. Los nombres de clase no cambian — `bg-navy`, `text-gold-deep`
// siguen funcionando igual — así que ninguna pantalla existente se entera del cambio. Los dos
// archivos se editan juntos: si no, uno de los dos empieza a mentir.
const t = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: t('--navy'), dark: t('--navy-dark'), deep: t('--navy-deep') },
        // `soft` es el oro luminoso del manual (§6, "Gold Claro"), no el apagado que había antes:
        // se usa en hover, y un hover que baja la saturación se siente como que algo se apagó.
        // `deep` es el "Gold Oscuro" del manual, el único gold que se puede leer como texto sobre
        // fondo claro. Reemplaza al #7a6e0e que estaba escrito a mano en veinte lugares.
        gold: { DEFAULT: t('--gold'), soft: t('--gold-soft'), deep: t('--gold-deep') },
        paper: t('--paper'),
        ink: t('--ink'),
        line: t('--line'),
        muted: t('--muted'),
        // La tarjeta. Blanco cálido, no blanco puro — `paper` y una tarjeta blanca eran casi el
        // mismo color, así que todo se leía plano. `hundida` es lo que recibe algo: campo, celda
        // de kanban, cebra de tabla.
        superficie: { DEFAULT: t('--superficie'), hundida: t('--superficie-hundida') },
        // El acento del módulo (spec §3.3). Una ruta lo fija con una clase `.m-*` (fase 5); hasta
        // entonces cae en navy. `bg-acento-soft`, `border-acento-line`, `text-acento-deep` ya
        // funcionan hoy con ese default — no hace falta esperar a la fase 5 para usarlos.
        acento: { DEFAULT: t('--acento'), soft: t('--acento-soft'), line: t('--acento-line'), deep: t('--acento-deep') },

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
        exito: { soft: t('--exito-soft'), line: t('--exito-line'), DEFAULT: t('--exito'), deep: t('--exito-deep') },
        aviso: { soft: t('--aviso-soft'), line: t('--aviso-line'), DEFAULT: t('--aviso'), deep: t('--aviso-deep') },
        error: { soft: t('--error-soft'), line: t('--error-line'), DEFAULT: t('--error'), deep: t('--error-deep') },
        info: { soft: t('--info-soft'), line: t('--info-line'), DEFAULT: t('--info'), deep: t('--info-deep') },

        // ── Categóricos ───────────────────────────────────────────────────────────────────
        //
        // IDENTIDAD, NUNCA ESTADO. Distinguen cosas que conviven —un rol, un tipo de lavado— y no
        // dicen si algo está bien o mal. Van agrupados bajo `cat` justamente para que no se
        // confundan: `bg-cat-lila-soft` no se escribe por accidente creyendo que avisa algo.
        //
        // POR QUÉ HACEN FALTA. Sin ellos, los chips de rol terminaban pintados con el verde de
        // éxito, y verde ya quiere decir "correcto". Un encargado no es un acierto.
        //
        // Siete familias (spec §3.3): tres existentes —lila, arcilla, mar— y cuatro nuevas de la
        // segunda pasada visual —oliva, ciruela, humo, piedra—, elegidas por hueco de tono libre
        // para no caer encima de ningún semántico. La fase 5 les asigna un grupo de módulo cada
        // una; acá sólo existen como color.
        cat: {
          lila: { soft: t('--cat-lila-soft'), line: t('--cat-lila-line'), DEFAULT: t('--cat-lila'), deep: t('--cat-lila-deep') },
          arcilla: { soft: t('--cat-arcilla-soft'), line: t('--cat-arcilla-line'), DEFAULT: t('--cat-arcilla'), deep: t('--cat-arcilla-deep') },
          mar: { soft: t('--cat-mar-soft'), line: t('--cat-mar-line'), DEFAULT: t('--cat-mar'), deep: t('--cat-mar-deep') },
          oliva: { soft: t('--cat-oliva-soft'), line: t('--cat-oliva-line'), DEFAULT: t('--cat-oliva'), deep: t('--cat-oliva-deep') },
          ciruela: { soft: t('--cat-ciruela-soft'), line: t('--cat-ciruela-line'), DEFAULT: t('--cat-ciruela'), deep: t('--cat-ciruela-deep') },
          humo: { soft: t('--cat-humo-soft'), line: t('--cat-humo-line'), DEFAULT: t('--cat-humo'), deep: t('--cat-humo-deep') },
          piedra: { soft: t('--cat-piedra-soft'), line: t('--cat-piedra-line'), DEFAULT: t('--cat-piedra'), deep: t('--cat-piedra-deep') },
        },
      },
      fontFamily: {
        // Outfit reemplaza a Cormorant Garamond como voz de título (segunda pasada visual,
        // "modo vibrante"): título, cifra y rótulo. Inter sigue siendo cuerpo y dato — es la que
        // tiene las cifras tabulares que hacen que una columna no baile. El corte está en la
        // cantidad de texto, no en la jerarquía: poner Outfit en una tabla de dieciocho filas
        // costaría legibilidad para ganar nada.
        display: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        // Sin familia `mono`: la tipografía de máquina de escribir se sacó del ERP el 21-ago-2026.
        // Los números se alinean con `tabular-nums`, que es lo que de verdad hacía falta.
      },
      // ── Escala tipográfica con nombre (spec §3.4) ──────────────────────────────────────────
      //
      // Nueve tamaños, ninguno vuelve a elegir `text-sm`/`text-xs` de Tailwind. Tamaño e
      // interlínea acá; peso y familia se componen aparte (`font-display font-bold`, etc.) — así
      // un `<Cifra>` o un `<Rotulo>` deciden su propio peso sin duplicar la escala.
      fontSize: {
        cifra: ['48px', { lineHeight: '0.95', letterSpacing: '-0.035em' }],
        titulo: ['34px', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        seccion: ['21px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        sub: ['16px', { lineHeight: '1.4' }],
        cuerpo: ['14px', { lineHeight: '1.55' }],
        dato: ['14px', { lineHeight: '1.4' }],
        apoyo: ['13px', { lineHeight: '1.45' }],
        rotulo: ['11px', { lineHeight: '1.2', letterSpacing: '0.1em' }],
        micro: ['11px', { lineHeight: '1.3' }],
      },
      // ── Radio (spec §3.7) ─────────────────────────────────────────────────────────────────
      //
      // Tres tamaños más la pastilla. No reemplaza la escala de Tailwind (`rounded-lg` etc. se
      // usan en 202+109+57+14+3+1 lugares hoy) — se suma al lado, y la fase 8 la va migrando
      // pantalla por pantalla.
      borderRadius: {
        'r-chico': '8px', // campo, celda, contenedor chico
        'r-medio': '14px', // tarjeta, StatBox, grupo de formulario
        'r-grande': '22px', // modal, drawer, panel de página, banda de módulo
        'r-pastilla': '9999px', // chip, badge, botón, opción, avatar, contador — nunca una superficie
      },
      // ── Elevación (spec §3.6) ─────────────────────────────────────────────────────────────
      //
      // `card`/`lift` se quedan tal cual — 27 pantallas los usan hoy. `elev-*` se suma al lado:
      // cuatro niveles con la sombra teñida del acento del módulo (nunca gris, nunca negra —
      // una sombra del color de lo que tiene encima se lee como luz), y `elev-3` conserva un
      // tramo de `ink` porque un modal tiene que despegarse del fondo de verdad.
      boxShadow: {
        card: '0 1px 2px rgba(27,36,64,0.05), 0 12px 28px -16px rgba(27,36,64,0.18)',
        lift: '0 2px 4px rgba(27,36,64,0.06), 0 20px 40px -20px rgba(27,36,64,0.30)',
        'elev-0': 'none',
        'elev-1': '0 1px 2px rgb(var(--acento) / 0.10), 0 2px 6px rgb(var(--acento) / 0.09)',
        'elev-2': '0 2px 6px rgb(var(--acento) / 0.12), 0 10px 24px rgb(var(--acento) / 0.16)',
        'elev-3': '0 10px 24px rgb(var(--acento) / 0.16), 0 32px 64px rgb(var(--ink) / 0.16)',
      },
      letterSpacing: { brand: '0.28em' },
      transitionTimingFunction: {
        // Curva ease-out fuerte (Emil): arranca rápido, se siente responsiva. 11 pantallas la usan
        // hoy — se queda igual. `salida`/`estado`/`rebote` de abajo son el mismo vocabulario que
        // usan los tokens CSS (`--curva-*`) para lo que no puede vivir en una clase de Tailwind.
        'out-expo': 'cubic-bezier(0.23, 1, 0.32, 1)',
        salida: 'cubic-bezier(0.23, 1, 0.32, 1)',
        estado: 'cubic-bezier(0.4, 0, 0.2, 1)',
        // Sobrepasa el destino un 4% y vuelve: es la diferencia entre "el elemento apareció" y
        // "el elemento llegó". Nunca en modal ni drawer — ahí una decisión se leería como juguete.
        rebote: 'cubic-bezier(0.34, 1.42, 0.64, 1)',
        viz: 'cubic-bezier(0.33, 1, 0.68, 1)',
      },
      transitionDuration: {
        instante: '100ms', // presión sobre un control
        rapido: '190ms', // cruce esqueleto→contenido
        base: '260ms', // casi todo lo repetitivo
        tope: '320ms', // techo del presupuesto repetitivo
        contexto: '500ms', // techo del presupuesto de contexto
        momento: '700ms', // techo del presupuesto de momento
      },
      keyframes: {
        // ── Las ocho que ya existen, sin tocar. 45 usos reales entre las 72 pantallas: cambiar
        // su duración o su curva ahora sería un rediseño silencioso de pantallas fuera de alcance.
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

        // ── Catálogo nuevo de la segunda pasada visual (spec §6). Diecisiete piezas, todas
        // nuevas y aditivas — nada de esto reemplaza a lo de arriba. Las que necesitan medir algo
        // en tiempo real (pestaña que se desliza, menú, número que rueda por posición de dígito,
        // prenda que avanza de columna, la vista compartida vía View Transitions) no tienen
        // keyframe propio: son transición/JS de componente, fase 3 en adelante — acá sólo quedan
        // disponibles sus tokens de duración y curva.
        'cruce-esqueleto': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'chip-entra': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'destello-valor': {
          '0%': { backgroundColor: 'rgb(var(--gold) / 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'hilo-cierre': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        // Trazo de un path con `pathLength="1"` — línea de un gráfico, el check de una
        // confirmación (mismo mecanismo que `check-dibuja` reutiliza abajo). Siempre dibuja
        // completo (1 → 0): para un arco PARCIAL, ver `anillo-llena`.
        trazar: {
          '0%': { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
        // El anillo de progreso no siempre se llena entero — `AnilloProgreso` conoce su propia
        // fracción (`nota / 20`, `avance / total`) y la pasa como `--p` por `style`. Sin `0%`
        // explícito: CSS interpola desde el valor inicial real (`stroke-dashoffset: 1`, puesto
        // por el componente vía `style`) hasta este único paso.
        'anillo-llena': {
          '100%': { strokeDashoffset: 'calc(1 - var(--p, 0))' },
        },
        'icono-pop': {
          '0%': { transform: 'scale(1) rotate(0deg)' },
          '45%': { transform: 'scale(1.16) rotate(-5deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        'pulso-acento': {
          '0%': { opacity: '0.95', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.22)' },
        },
        // Sweep autocontenido: no depende del ancho real de la pista, por eso puede vivir acá
        // sin medición de componente.
        'hilo-recorre': {
          '0%': { transform: 'translateX(-150%)' },
          '100%': { transform: 'translateX(250%)' },
        },
        'lista-cascada': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'chapa-brillo': {
          '0%': { transform: 'translateX(-140%)' },
          '100%': { transform: 'translateX(140%)' },
        },
        'progreso-vivo': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fondo-respira': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0.7' },
        },
        'error-sacude': {
          '0%, 100%': { transform: 'translateX(0)' },
          '18%': { transform: 'translateX(-7px)' },
          '38%': { transform: 'translateX(6px)' },
          '58%': { transform: 'translateX(-4px)' },
          '78%': { transform: 'translateX(2px)' },
        },
        'panel-entra': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // `grid-template-rows: 0fr → 1fr` en el contenedor del grupo: alto automático, sin medir
        // a mano. El hijo directo necesita `overflow: hidden` y `min-height: 0` para no recortarse.
        'grupo-expande': {
          '0%': { gridTemplateRows: '0fr' },
          '100%': { gridTemplateRows: '1fr' },
        },
        'numero-rueda': {
          '0%': { opacity: '0', transform: 'translateY(105%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'panel-cortina': {
          '0%': { opacity: '0.35', clipPath: 'inset(0 0 100% 0)' },
          '100%': { opacity: '1', clipPath: 'inset(0 0 0 0)' },
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

        // ── Catálogo nuevo. Duración por token donde coincide exacto con un techo de presupuesto;
        // literal donde el catálogo pide un valor propio (spec §6, columna "Duración").
        'cruce-esqueleto': 'cruce-esqueleto var(--dur-rapido) var(--curva-salida) both',
        'chip-entra': 'chip-entra 200ms var(--curva-rebote) both',
        'destello-valor': 'destello-valor 400ms var(--curva-estado)',
        'hilo-cierre': 'hilo-cierre var(--dur-momento) var(--curva-salida) both',
        trazar: 'trazar var(--dur-momento) var(--curva-viz) forwards',
        // Mismo trazo que `viz-dibuja` (arriba): el check de una confirmación es un `path` con
        // `pathLength="1"`, igual que una línea de gráfico.
        'check-dibuja': 'trazar var(--dur-momento) var(--curva-viz) forwards',
        'anillo-llena': 'anillo-llena var(--dur-momento) var(--curva-viz) forwards',
        'icono-pop': 'icono-pop 300ms var(--curva-rebote)',
        'pulso-acento': 'pulso-acento var(--dur-contexto) var(--curva-salida)',
        'hilo-recorre': 'hilo-recorre 1.6s var(--curva-estado) infinite',
        'lista-cascada': 'lista-cascada var(--dur-tope) var(--curva-rebote) both',
        'chapa-brillo': 'chapa-brillo var(--dur-momento) var(--curva-salida)',
        'progreso-vivo': 'progreso-vivo 1.8s linear infinite',
        'fondo-respira': 'fondo-respira 9s var(--curva-estado) infinite alternate',
        'error-sacude': 'error-sacude 300ms var(--curva-estado)',
        'panel-entra': 'panel-entra var(--dur-contexto) var(--curva-rebote) both',
        'grupo-expande': 'grupo-expande 300ms var(--curva-estado) both',
        'numero-rueda': 'numero-rueda var(--dur-contexto) var(--curva-rebote) both',
        'panel-cortina': 'panel-cortina 400ms var(--curva-salida) both',
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
