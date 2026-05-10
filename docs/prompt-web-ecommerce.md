# PROMPT PARA CLAUDE CODE — WEB E-COMMERCE LUCEBIEN

> Entrégalo en una sesión nueva de Claude Code.
> Trabaja en: `C:\Users\ASUS\Downloads\LuceBienWeb\` (carpeta nueva, repo independiente del ERP).
> Antes de empezar: lee los archivos de referencia listados en la sección "Archivos de referencia".

---

## ROL Y OBJETIVO

Eres el Lead Developer de **LuceBien 360**. Tu misión en esta sesión es construir el **sitio web público (e-commerce)** de LuceBien desde cero usando Next.js 14.

El sistema de diseño ya está completamente definido — tienes tokens CSS, logos y una guía de marca. Tu trabajo es implementarlos fielmente, no inventar estilos.

---

## ARCHIVOS DE REFERENCIA (leer antes de codear)

```
C:\Users\ASUS\Downloads\LuceBien Sistema de Diseno.html  ← diseño completo interactivo
C:\Users\ASUS\Downloads\Lucebien.zip                     ← contiene tokens.css + logos
C:\Users\ASUS\Downloads\Lucebien\docs\manual-de-marca.md ← reglas de identidad visual
C:\Users\ASUS\Downloads\Lucebien\public\assets\          ← logos PNG originales
```

**Lee primero el `Sistema de Diseno.html` abriéndolo en el navegador para ver el diseño visual, luego extrae el `tokens.css` del zip como base CSS.**

---

## CONTEXTO DE LA EMPRESA

**LuceBien** — alquiler y venta de trajes formales (ternos) en Arequipa, Perú.
- Tagline: **"Para la Ocasión"**
- 3 tiendas físicas: LuceBien (LB), Stand 101-102 (ST), Trece (TR)
- Clientes: hombres que necesitan verse bien en bodas, graduaciones, eventos
- Precio en soles peruanos: formato `S/ 120`
- Nombre siempre: **LuceBien** (L y B en mayúscula, una sola palabra)

---

## STACK TÉCNICO

```
Framework:     Next.js 14 (App Router)
Lenguaje:      TypeScript
Estilos:       CSS Modules + tokens.css global (NO Tailwind)
Íconos:        lucide-react
Fuentes:       Google Fonts (Inter + Cormorant Garamond + JetBrains Mono)
Imágenes:      next/image
Package mgr:   npm
```

**Por qué CSS Modules en vez de Tailwind:** el sistema de diseño ya está construido con clases CSS semánticas y custom properties. Implementarlo con CSS Modules es más fiel, más fácil de mantener para este equipo, y evita que Tailwind sobreescriba los tokens.

---

## ESTRUCTURA DEL PROYECTO

```
lucebien-web/
├── app/
│   ├── layout.tsx              ← layout raíz con fuentes + tokens
│   ├── page.tsx                ← Home
│   ├── coleccion/
│   │   └── page.tsx            ← Catálogo / Colección
│   ├── producto/
│   │   └── [slug]/page.tsx     ← Página de producto individual
│   ├── reservar/
│   │   └── page.tsx            ← Checkout / flujo de reserva
│   └── nosotros/
│       └── page.tsx            ← Página "Quiénes somos"
├── components/
│   ├── layout/
│   │   ├── Header.tsx          ← nav sticky con logo + menú + carrito
│   │   ├── Footer.tsx          ← footer con zigzag gold + links + sedes
│   │   └── TopBand.tsx         ← franja anuncio superior
│   ├── ui/
│   │   ├── Button.tsx          ← btn-primary / btn-secondary / btn-gold / btn-ghost
│   │   ├── Badge.tsx           ← disponible / agotado / nuevo / etc.
│   │   ├── Toast.tsx           ← notificaciones
│   │   └── ZigzagRule.tsx      ← separador con motivo zigzag
│   ├── product/
│   │   ├── ProductCard.tsx     ← card con imagen, nombre, precio, CTA
│   │   ├── ProductGrid.tsx     ← grid responsive de cards
│   │   └── ProductGallery.tsx  ← galería principal + miniaturas
│   ├── home/
│   │   ├── HeroSection.tsx
│   │   ├── CategoriesSection.tsx
│   │   ├── ProcessSection.tsx  ← "¿Cómo funciona?" 4 pasos
│   │   ├── FeaturedSection.tsx ← productos destacados
│   │   ├── WhySection.tsx      ← "¿Por qué LuceBien?"
│   │   ├── SedesSection.tsx    ← las 3 tiendas
│   │   └── TestimonialsSection.tsx
│   └── checkout/
│       ├── Stepper.tsx         ← indicador de pasos
│       ├── CartSummary.tsx
│       └── CheckoutForm.tsx
├── styles/
│   ├── tokens.css              ← COPIAR EXACTO del zip (no modificar)
│   ├── globals.css             ← reset + imports de tokens
│   └── [Component].module.css ← un CSS module por componente
├── lib/
│   ├── types.ts                ← tipos TypeScript de dominio
│   └── data.ts                 ← datos mock para desarrollo
└── public/
    └── assets/                 ← logos copiados del zip
```

---

## DESIGN TOKENS (tokens.css)

Extrae el `tokens.css` del zip y cópialo exactamente en `styles/tokens.css`. Las variables usan el prefijo `--lb-`. Ejemplos clave:

```css
--lb-navy: #2e3e6e;      --lb-gold: #b8a515;
--lb-bg: #f8f7f4;        --lb-ink: #1a1a1a;
--lb-font-body: 'Inter'; --lb-font-display: 'Cormorant Garamond';
--lb-font-mono: 'JetBrains Mono';
```

**Regla absoluta:** ningún color, tamaño ni fuente se escribe hardcodeado. Todo usa variables `var(--lb-*)`.

---

## TIPOS TYPESCRIPT DE DOMINIO

```typescript
// lib/types.ts

export interface Prenda {
  id: string
  slug: string
  nombre: string
  descripcion: string
  tipo: 'terno-completo' | 'saco' | 'pantalon' | 'accesorio'
  precioAlquiler: number        // en soles
  precioVenta?: number          // undefined si no está a la venta
  tallas: string[]              // ['S', 'M', 'L', 'XL', 'XXL']
  colores: string[]
  imagenes: string[]            // rutas relativas a /public
  disponible: boolean
  destacado?: boolean
  nuevo?: boolean
  codigoReferencia: string      // ej. "LB-120" — mostrar en JetBrains Mono
}

export interface Sede {
  id: 'LB' | 'ST' | 'TR'
  nombre: string                // "LuceBien" | "Stand 101-102" | "Trece"
  direccion: string
  horario: string
  telefono: string
  maps_url?: string
}

export interface ItemCarrito {
  prenda: Prenda
  talla: string
  cantidad: number
  tipoOperacion: 'alquiler' | 'venta'
  fechaEvento?: Date
}

export interface PasoCheckout {
  id: number
  label: string
  completado: boolean
  activo: boolean
}
```

---

## DATOS MOCK (para desarrollo sin backend)

```typescript
// lib/data.ts

export const SEDES: Sede[] = [
  {
    id: 'LB',
    nombre: 'LuceBien',
    direccion: 'Arequipa, Perú',
    horario: 'Lun–Sáb 9:00–20:00 · Dom 10:00–18:00',
    telefono: '+51 XXX XXX XXX'
  },
  {
    id: 'ST',
    nombre: 'Stand 101-102',
    direccion: 'Arequipa, Perú',
    horario: 'Lun–Sáb 9:00–20:00',
    telefono: '+51 XXX XXX XXX'
  },
  {
    id: 'TR',
    nombre: 'Trece',
    direccion: 'Arequipa, Perú',
    horario: 'Lun–Sáb 9:00–20:00',
    telefono: '+51 XXX XXX XXX'
  }
]

export const PRENDAS_MOCK: Prenda[] = [
  {
    id: '1',
    slug: 'terno-clasico-navy',
    nombre: 'Terno Clásico Navy',
    descripcion: 'Elegancia intemporal para tu momento especial.',
    tipo: 'terno-completo',
    precioAlquiler: 120,
    precioVenta: 850,
    tallas: ['S', 'M', 'L', 'XL'],
    colores: ['Navy', 'Negro'],
    imagenes: ['/assets/placeholder-terno.jpg'],
    disponible: true,
    destacado: true,
    codigoReferencia: 'LB-001'
  }
  // agregar más según necesites para probar el grid
]
```

---

## COMPONENTES — ESPECIFICACIÓN DETALLADA

### Header.tsx

```
- Franja superior (TopBand): navy oscuro, texto blanco pequeño, mensaje configurable
- Header sticky con backdrop-blur en scroll
- Izquierda: logo_full_color.png con next/image (alt="LuceBien")
- Centro (desktop): nav links — Colección / Alquiler / Compra / Nosotros / Contacto
- Derecha: ícono búsqueda (lucide Search) + ícono carrito (lucide ShoppingBag)
  con badge contador navy/gold + ícono cuenta (lucide User)
- Mobile: hamburger (lucide Menu) → drawer lateral con los links
- Altura: 72px desktop, 60px mobile
- Borde inferior: 1px var(--lb-border) visible solo en scroll
```

### Footer.tsx

```
- Separador zigzag gold arriba (.lb-zigzag-line del tokens.css)
- Fondo: var(--lb-navy-deep)
- Logo versión blanca (logo_full_white.png)
- Tagline "Para la Ocasión" debajo del logo
- 4 columnas: Colección · La Empresa · Ayuda · Síguenos
- Datos de las 3 sedes (usar array SEDES)
- Copyright: "© 2026 LuceBien. Arequipa, Perú."
- Texto en var(--lb-d-ink-muted), links hover var(--lb-gold)
```

### ProductCard.tsx

```
Props: prenda: Prenda, onAddToCart?: () => void

- Imagen 3:4 vertical con next/image, object-cover
- Badge de disponibilidad (verde/rojo) — top-left sobre la imagen
- Badge "Destacado" gold — top-right si prenda.destacado
- Nombre: Inter semibold, var(--lb-text-lg)
- Código de referencia: JetBrains Mono, var(--lb-text-xs), color muted
- Precio alquiler: "Desde S/ 120" bold
- Precio venta (si existe): "Compra S/ 850" muted, más pequeño
- CTA "Reservar" (btn-primary sm) en hover o siempre visible mobile
- Hover: translateY(-4px) + var(--lb-shadow-md) + borde gold inferior 2px
- Transición: var(--lb-dur-base) var(--lb-ease-out)
```

### HeroSection.tsx

```
- Altura mínima: 90vh desktop, auto mobile
- Fondo: imagen de terno + overlay gradient navy (bottom-up, 0.7 opacity)
- Imagen placeholder: degradado navy oscuro hasta que haya foto real
- Contenido centrado verticalmente:
  · Eyebrow: "AREQUIPA · PERÚ" en Cormorant tracking-mega, gold
  · Título H1: "Para la Ocasión" en Cormorant Garamond, var(--lb-text-6xl), blanco
  · Subtítulo: Inter regular, var(--lb-text-xl), rgba(blanco, 0.85), max 480px
  · CTAs: "Ver colección" (btn-gold lg) + "¿Cómo funciona?" (btn-ghost lg, borde blanco)
  · Gap entre CTAs: var(--lb-space-4)
- Badge flotante abajo-izquierda: "3 tiendas en Arequipa" pill navy/gold
```

### ProcessSection.tsx ("¿Cómo funciona?")

```
- Fondo: var(--lb-bg-alt) (crema)
- Título de sección centrado
- Separador zigzag gold (.lb-zigzag-line) arriba y abajo de la sección
- 4 pasos en fila (desktop) / columna (mobile):
  1. Ícono lucide ShoppingBag   · "Elige tu terno" · "Explora nuestra colección..."
  2. Ícono lucide Calendar       · "Reserva" · "En línea o visítanos en tienda..."
  3. Ícono lucide Ruler          · "Prueba y ajusta" · "Nuestros sastres garantizan..."
  4. Ícono lucide Star           · "Luce impecable" · "Llega a tu evento con confianza."
- Número del paso: Cormorant bold, var(--lb-text-4xl), var(--lb-gold), opacity 0.3
- Conector entre pasos: línea punteada gold (desktop solamente)
```

### ZigzagRule.tsx

```tsx
// Implementar usando la clase .lb-zigzag-line del tokens.css
// Props: muted?: boolean (usa var(--lb-border) en vez de gold)
interface Props { muted?: boolean; className?: string }
```

### Button.tsx

```
Variantes: 'primary' | 'secondary' | 'gold' | 'ghost'
Tamaños: 'sm' | 'md' | 'lg'
Estados: default, hover, active, disabled, loading (spinner inline)

primary:   fondo var(--lb-navy), texto blanco, hover fondo var(--lb-navy-light)
secondary: borde 1.5px var(--lb-navy), transparente, hover fondo var(--lb-gold-pale)
gold:      fondo var(--lb-gold), texto var(--lb-navy-deep), hover shadow-gold
ghost:     sin borde, texto var(--lb-navy), hover color var(--lb-gold) + underline

- Border-radius: var(--lb-radius-md)
- Transición: all var(--lb-dur-fast) var(--lb-ease-out)
- Font: Inter semibold
- Cursor: not-allowed + opacity 0.45 si disabled
```

---

## HOME PAGE — ORDEN DE SECCIONES

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CategoriesSection />      {/* 4 categorías: Terno / Saco / Pantalón / Accesorios */}
      <FeaturedSection />        {/* productos con destacado: true */}
      <ProcessSection />         {/* "¿Cómo funciona?" con zigzag */}
      <WhySection />             {/* 3 pilares: experiencia / ajuste / disponibilidad */}
      <SedesSection />           {/* las 3 tiendas */}
      <TestimonialsSection />    {/* 3 testimonios mock */}
    </>
  )
}
```

---

## PÁGINA DE PRODUCTO — /producto/[slug]

```
Layout:
- Lado izquierdo (60%): galería con imagen principal + fila de miniaturas
- Lado derecho (40%): info + acciones

Info:
- Breadcrumb: Inicio > Colección > [Nombre]
- Código referencia (JetBrains Mono, muted)
- Nombre H1
- Precio alquiler destacado (Cormorant bold, var(--lb-text-3xl), navy)
- Precio venta si existe (muted, tachado si hay oferta)
- Selector de tallas: botones con estados active/disabled
- Guía de tallas: link que abre modal
- Disponibilidad por sede: mini tabla (Sede · Disponible/Pocas/Agotado)
- Fecha del evento: date picker nativo estilizado
- CTA principal: "Reservar ahora" (btn-gold lg, full-width)
- CTA secundario: "Agregar al carrito" (btn-secondary lg, full-width)
- Acordeón: Descripción / Materiales y cuidados / Política de alquiler
```

---

## PÁGINA DE RESERVA (CHECKOUT) — /reservar

```
Stepper de 4 pasos en el top: Datos · Entrega · Fecha · Confirmación
Layout: contenido izquierda (60%) + resumen sticky derecha (40%)

Paso 1 — Datos personales:
  Nombre completo / DNI / Teléfono / Email

Paso 2 — Tipo de entrega:
  Radio: "Recoger en tienda" (con selector de sede) vs "Delivery" (con dirección)

Paso 3 — Fecha del evento:
  Date picker con validación (no puede ser en el pasado, mín 2 días de anticipación)

Paso 4 — Confirmación:
  Resumen completo + "Confirmar reserva" (btn-gold lg)
  Nota: "Un asesor te contactará para coordinar la prueba."
```

---

## REGLAS DE IMPLEMENTACIÓN

### CSS
- Un archivo `[Componente].module.css` por componente
- Clases en camelCase dentro del module: `styles.productCard`, `styles.priceLabel`
- Todos los valores desde tokens: `color: var(--lb-navy)`, nunca `color: #2e3e6e`
- Media queries: mobile-first, breakpoints `var(--lb-bp-sm)` (640px) y `var(--lb-bp-md)` (1024px)
- Animaciones: solo las del tokens.css (`var(--lb-dur-*)`, `var(--lb-ease-*)`)

### TypeScript
- Tipos explícitos en todas las props (no `any`)
- Componentes con interface Props encima del componente
- Datos mock en `lib/data.ts`, no inline en componentes

### Next.js
- `'use client'` solo donde sea imprescindible (interactividad real)
- `next/image` para todas las imágenes con `priority` en el hero
- `next/font` para cargar Inter y Cormorant Garamond (no CDN)
- Metadata en `app/layout.tsx`: title "LuceBien — Para la Ocasión", description, og:image

### Contenido
- Todo en español
- Precios siempre con `S/ ` antes del número
- Nombre de la empresa: siempre **LuceBien** (L y B en mayúscula)

---

## ORDEN DE CONSTRUCCIÓN (ejecutar en esta secuencia)

```
1. Crear proyecto Next.js:
   npx create-next-app@latest lucebien-web --typescript --app --no-tailwind --src-dir=false
   cd lucebien-web

2. Instalar dependencias:
   npm install lucide-react

3. Copiar tokens.css a styles/tokens.css (extraer del zip)

4. Configurar app/layout.tsx:
   - Importar tokens.css + globals.css
   - Cargar fuentes con next/font/google
   - Agregar <Header /> y <Footer /> wrapping children

5. Construir componentes UI base (Button, Badge, ZigzagRule)

6. Construir layout (Header, Footer, TopBand)

7. Construir Home page sección por sección

8. Construir ProductCard + ProductGrid

9. Construir página /coleccion

10. Construir página /producto/[slug]

11. Construir página /reservar con Stepper

12. Verificar responsive en 375px / 768px / 1280px
```

---

## VERIFICACIÓN FINAL

Antes de reportar como terminado, confirma:

```
[ ] npm run build pasa sin errores TypeScript
[ ] npm run dev corre en http://localhost:3000
[ ] Home page muestra todas las secciones
[ ] Header sticky funciona en scroll
[ ] ProductCard hover funciona
[ ] ZigzagRule gold visible entre secciones
[ ] Responsive: mobile 375px sin overflow horizontal
[ ] Fuentes cargan: Cormorant en hero, Inter en UI, JetBrains Mono en códigos
[ ] Ningún color hardcodeado (grep: #2e3e6e, #b8a515 no deben aparecer en .tsx/.css)
[ ] Logo visible en header y footer (versiones correctas: color/blanco)
```

---

## CONTEXTO DE INTEGRACIÓN FUTURA (no implementar ahora)

El ERP interno corre en `http://localhost:7000`. En el futuro:
- Las reservas de la web crearán tareas en el kanban del ERP via API
- La disponibilidad de prendas vendrá de `GET /api/prendas/disponibles`
- El catálogo se alimentará de la BD del ERP

Por ahora, todo usa datos mock de `lib/data.ts`. Deja los servicios preparados como funciones en `lib/api.ts` (vacías o con mock) para que la integración futura sea solo cambiar la implementación.

---

## REPORTE ESPERADO AL TERMINAR

```
ESTADO
======
[ ] Proyecto creado en C:\Users\ASUS\Downloads\LuceBienWeb\
[ ] Dependencias instaladas
[ ] tokens.css integrado
[ ] Componentes UI base: Button / Badge / ZigzagRule
[ ] Layout: Header / Footer / TopBand
[ ] Home page: todas las secciones
[ ] Página /coleccion con grid
[ ] Página /producto/[slug]
[ ] Página /reservar con stepper
[ ] Build limpio sin errores
[ ] Dev server corriendo

PENDIENTE PARA PRÓXIMA SESIÓN
==============================
[ descripción de lo que quedó sin hacer si algo ]
```
