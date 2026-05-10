# PROMPT PARA CLAUDE CODE — WEB LUCEBIEN FASE 2
## Funcionalidad completa + Landing scrollytelling + Responsive

> Continuación del proyecto en `C:\Users\PC01\Documents\LuceBienWeb\`
> El proyecto ya existe y corre en http://localhost:3000
> No crear proyecto nuevo — extender el existente.

---

## CONTEXTO RÁPIDO

El sitio LuceBien ya está scaffoldeado con Next.js 14 + TypeScript + CSS Modules.
Tokens en `styles/tokens.css` con prefijo `--lb-*`. Logos en `public/assets/`.
El diseño base funciona (footer, header, cards de producto) pero hay gaps importantes.

---

## PROBLEMAS ACTUALES A RESOLVER

1. **Páginas "Alquiler" y "Compra" no existen** — el nav las linka pero no hay rutas
2. **Buscador no funciona** — el ícono abre nada
3. **Carrito no funciona** — sin estado, sin drawer, sin lógica
4. **Usuario no funciona** — sin menú, sin lógica
5. **Landing sin vida** — estático, sin animaciones ni scrollytelling
6. **Responsive incompleto** — revisar mobile 375px en todas las páginas

---

## TAREA 1 — INSTALAR DEPENDENCIAS NUEVAS

```bash
npm install framer-motion zustand
```

- **framer-motion** — animaciones del scrollytelling y transiciones
- **zustand** — estado global del carrito (simple, sin boilerplate de Redux)

---

## TAREA 2 — PÁGINAS FALTANTES

### /alquiler y /compra

Estas páginas son simplemente `/coleccion` filtrada. Créalas como wrappers:

```
app/alquiler/page.tsx  → redirige a /coleccion?modo=alquiler  (use redirect())
app/compra/page.tsx    → redirige a /coleccion?modo=venta      (use redirect())
```

Alternativa más limpia: que el Header pase el query param directo en el `<Link>`:
```tsx
<Link href="/coleccion?modo=alquiler">Alquiler</Link>
<Link href="/coleccion?modo=venta">Compra</Link>
```

Asegúrate de que `/coleccion` ya lee esos params y filtra las prendas.
Si no lo hace, agrégalo en el componente `CollectionView` o `page.tsx`.

---

## TAREA 3 — ESTADO GLOBAL DEL CARRITO (Zustand)

Crea `lib/store/carritoStore.ts`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Prenda } from '@/lib/types'

interface ItemCarrito {
  prenda: Prenda
  talla: string
  cantidad: number
  tipoOperacion: 'alquiler' | 'venta'
  fechaEvento?: string   // ISO string para serialización
}

interface CarritoStore {
  items: ItemCarrito[]
  agregarItem: (item: ItemCarrito) => void
  quitarItem: (prendaId: string, talla: string) => void
  actualizarCantidad: (prendaId: string, talla: string, cantidad: number) => void
  vaciarCarrito: () => void
  totalItems: () => number
  totalPrecio: () => number
}

export const useCarritoStore = create<CarritoStore>()(
  persist(
    (set, get) => ({
      items: [],
      agregarItem: (nuevoItem) => set((state) => {
        const existente = state.items.find(
          i => i.prenda.id === nuevoItem.prenda.id && i.talla === nuevoItem.talla
        )
        if (existente) {
          return {
            items: state.items.map(i =>
              i.prenda.id === nuevoItem.prenda.id && i.talla === nuevoItem.talla
                ? { ...i, cantidad: i.cantidad + nuevoItem.cantidad }
                : i
            )
          }
        }
        return { items: [...state.items, nuevoItem] }
      }),
      quitarItem: (prendaId, talla) => set((state) => ({
        items: state.items.filter(i => !(i.prenda.id === prendaId && i.talla === talla))
      })),
      actualizarCantidad: (prendaId, talla, cantidad) => set((state) => ({
        items: cantidad === 0
          ? state.items.filter(i => !(i.prenda.id === prendaId && i.talla === talla))
          : state.items.map(i =>
              i.prenda.id === prendaId && i.talla === talla ? { ...i, cantidad } : i
            )
      })),
      vaciarCarrito: () => set({ items: [] }),
      totalItems: () => get().items.reduce((sum, i) => sum + i.cantidad, 0),
      totalPrecio: () => get().items.reduce((sum, i) => {
        const precio = i.tipoOperacion === 'alquiler'
          ? i.prenda.precioAlquiler
          : (i.prenda.precioVenta ?? i.prenda.precioAlquiler)
        return sum + precio * i.cantidad
      }, 0)
    }),
    { name: 'lucebien-carrito' }  // persiste en localStorage
  )
)
```

---

## TAREA 4 — DRAWER DEL CARRITO

Crea `components/carrito/CarritoDrawer.tsx`:

**Comportamiento:**
- Slide-in desde la derecha (framer-motion `x: '100%' → x: 0`)
- Overlay oscuro detrás con `onClick` para cerrar
- Z-index: `var(--lb-z-drawer)` (400)
- Ancho: 420px desktop / 100vw mobile

**Contenido:**
```
Header del drawer:
  "Mi Carrito" (h2) + cantidad de items + botón X (lucide X)

Lista de items (scroll interno):
  Por cada item:
    - Imagen thumb 80×80 con object-cover
    - Nombre de la prenda
    - Talla · Tipo (Alquiler / Compra)
    - Fecha del evento si existe
    - Precio unitario (JetBrains Mono)
    - Controles cantidad: [−] [N] [+]
    - Botón eliminar (lucide Trash2, pequeño, muted)

Footer del drawer (sticky abajo):
  Subtotal: S/ XXX (JetBrains Mono, bold)
  Botón "Proceder al pago" (btn-gold, full-width)
  Botón "Seguir comprando" (btn-ghost, full-width)

Si carrito vacío:
  Ícono lucide ShoppingBag grande (muted)
  "Tu carrito está vacío"
  Botón "Ver colección" (btn-primary)
```

**Animación de entrada/salida:**
```tsx
<motion.div
  initial={{ x: '100%' }}
  animate={{ x: 0 }}
  exit={{ x: '100%' }}
  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
>
```

Usa `AnimatePresence` para el unmount animado.

Crea `lib/store/uiStore.ts` para controlar qué drawers/modales están abiertos:
```typescript
interface UIStore {
  carritoAbierto: boolean
  busquedaAbierta: boolean
  menuMovilAbierto: boolean
  abrirCarrito: () => void
  cerrarCarrito: () => void
  toggleBusqueda: () => void
  cerrarMenuMovil: () => void
  toggleMenuMovil: () => void
}
```

---

## TAREA 5 — BUSCADOR MODAL

Crea `components/busqueda/BusquedaModal.tsx`:

**Comportamiento:**
- Se abre al clickear el ícono lupa del Header
- Overlay full-screen con blur backdrop (`backdrop-filter: blur(8px)`)
- Input centrado grande con auto-focus
- Resultados aparecen debajo mientras el usuario escribe (debounce 300ms)
- ESC cierra el modal
- Click fuera cierra el modal

**Layout:**
```
Overlay oscuro con blur
  ↓ contenedor centrado (max-width: 600px)
    Input grande:
      placeholder: "Buscar ternos, sacos, accesorios..."
      border-bottom: 2px solid var(--lb-gold)
      font: Inter 1.25rem
      sin border lateral ni fondo
    
    Resultados (si hay texto):
      Mini ProductCard horizontal por cada resultado
      (imagen 60×80 + nombre + precio + tipo)
      Máx 5 resultados visibles, scroll si hay más
    
    Sin resultados:
      "No encontramos '___'. Prueba con otro término."
```

**Lógica de búsqueda:**
- Por ahora: filtra sobre `PRENDAS_MOCK` de `lib/data.ts`
- Busca en: `nombre`, `tipo`, `codigoReferencia`, `colores`, `descripcion`
- Cuando haya backend: cambiar el stub en `lib/api.ts`

---

## TAREA 6 — MENÚ DE USUARIO (dropdown)

Crea `components/usuario/UsuarioMenu.tsx`:

**Por ahora sin auth real — preparar la UI:**

```
Click en ícono User → dropdown animado (framer-motion scale + fade)

Si no autenticado:
  "Iniciar sesión" (btn-primary sm)
  "Crear cuenta" (btn-ghost sm)
  Separador
  "¿Tienes una reserva? Consúltala" → link a /mis-reservas

Si autenticado (preparar props para cuando haya auth):
  Avatar con inicial del nombre
  "Mi cuenta"
  "Mis reservas"
  "Cerrar sesión"
```

El dropdown se cierra con click fuera (useEffect + event listener en document).

---

## TAREA 7 — LANDING CON SCROLLYTELLING

Este es el cambio más grande. El home debe sentirse como una experiencia cinematográfica. Cada sección entra con animación al hacer scroll.

### Instalar el hook de animación (sin librería extra)

Crea `hooks/useScrollAnimation.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'

export function useScrollAnimation(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}
```

### HeroSection — rediseño completo

**Desktop:**
```
Altura: 100vh
Fondo: gradient navy diagonal (no imagen por ahora — preparado para foto)
  background: linear-gradient(135deg, var(--lb-navy-deep) 0%, var(--lb-navy) 60%, #1a2a50 100%)

Contenido dividido en 2 columnas:
  Izquierda (55%):
    Eyebrow animado: "AREQUIPA · PERÚ" letra por letra (stagger)
    H1 enorme: "Para la\nOcasión" en Cormorant Garamond, 5xl/6xl, blanco
      → La palabra "Ocasión" con color var(--lb-gold)
    Subtítulo fadeIn con delay: texto descriptivo
    CTAs slideUp con delay mayor
    Badge flotante: "3 tiendas · Desde S/ 80"

  Derecha (45%):
    Cuadrado/rectángulo con placeholder elegante:
      gradient dorado sutil + sello del león (logo_lion_white.png) centrado grande
      borde zigzag (SVG inline o CSS clip-path)
      Texto superpuesto: "Terno Clásico Navy · S/ 120"
    Este bloque rotará entre 3 "productos destacados" con autoplay cada 4s

Abajo del todo: flecha animada pulsando (lucide ChevronDown) indicando scroll
```

**Mobile (< 640px):**
```
Altura: auto, padding-top: 100px (por el header)
1 columna centrada
H1 más pequeño (3xl)
Sin el bloque de producto derecho (se oculta)
CTAs en columna
```

### Animaciones por sección (aplicar a TODAS las secciones del home)

Patrón base con framer-motion:

```tsx
// En cada sección, wrappear el contenido con:
<motion.div
  initial={{ opacity: 0, y: 40 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-80px' }}
  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
>
```

**Variaciones por sección:**

| Sección | Animación entrada | Stagger |
|---|---|---|
| CategoriesSection | Cards con delay escalonado (0.1s entre cards) | Sí |
| FeaturedSection | Cards slideUp escalonado | Sí |
| ProcessSection | Pasos de izquierda a derecha con línea que se dibuja | Sí |
| WhySection | Counter animado en números (0 → valor final) | Sí |
| SedesSection | Cards con fade + scale desde 0.95 | Sí |
| TestimonialsSection | Fade suave | No |

### ProcessSection — animación especial "línea que avanza"

```
Los 4 pasos tienen una línea conectora horizontal (desktop).
Al entrar en viewport, la línea se "dibuja" de izquierda a derecha
usando stroke-dashoffset animation en SVG, o scaleX de 0 a 1 en un div.
Cada paso aparece cuando la línea llega a él.
```

### WhySection — contadores animados

Si hay números (ej. "15 años de experiencia", "3 tiendas", "500+ clientes"):
```typescript
// hook useCounter(from, to, duration, trigger)
// cuando la sección entra en viewport, los números suben de 0 al valor final
```

### CategoriesSection — hover con reveal

```
4 cards de categoría en grid
Hover: imagen de fondo aparece con opacity 0 → 0.3 (overlay navy encima)
       El texto sube ligeramente (translateY -8px)
       Borde gold aparece
Transición: 300ms ease-out
```

### Parallax sutil en el Hero

```
El sello del león en el lado derecho del hero tiene un efecto parallax suave:
al hacer scroll hacia abajo, el elemento sube más lento que el resto.
Implementar con framer-motion useScroll + useTransform:

const { scrollY } = useScroll()
const y = useTransform(scrollY, [0, 500], [0, -80])
```

---

## TAREA 8 — MEJORAS DE DISEÑO GENERALES

### Header

```
- Agregar transición cuando el usuario hace scroll:
  · Sin scroll: transparente o semi-transparente sobre el hero
  · Con scroll (>50px): fondo blanco sólido + sombra shadow-sm
  · Transición suave 250ms

- Badge del carrito: número animado con framer-motion scale cuando cambia
  (layoutId para animación de número)

- Active state en nav links según la ruta actual (usePathname)
```

### Footer (pequeño fix del screenshot)

```
El tagline "Para la Ocasión" debe estar en Cormorant Garamond italic, color var(--lb-gold)
(en el screenshot se ve en un amarillo que puede ser más vivo)
Ajustar si ya no está aplicando la fuente correcta.
```

### ProductCard — mejorar hover

```
Estado hover:
  - translateY(-6px) + shadow-lg
  - Borde inferior 3px var(--lb-gold) con transición
  - El botón "Reservar" hace slideUp desde abajo (overflow hidden)
  - Overlay muy sutil var(--lb-gold-pale) sobre la imagen
```

### ZigzagRule — hacer más visible

```
El zigzag del screenshot se ve muy tenue.
Aumentar el stroke-width a 1.5 y asegurar que el color es var(--lb-gold) sin opacity.
```

---

## TAREA 9 — RESPONSIVE COMPLETO

Verifica y corrige en estos breakpoints exactos:

**375px (iPhone SE / mobile pequeño):**
- Header: logo visible, 3 íconos (lupa, carrito, hamburger) sin overflow
- Hero: H1 en 2.5rem máximo, sin texto cortado
- ProductCard: 1 columna, imagen proporcionada
- Footer: todo en 1 columna

**768px (tablet):**
- Header: nav oculto → hamburger visible
- Grid de productos: 2 columnas
- Hero: H1 en 3.5rem
- Footer: 2 columnas

**1024px+ (desktop):**
- Nav visible completo
- Grid productos: 3-4 columnas
- Hero: split 2 columnas

**Regla:** ninguna sección tiene overflow-x horizontal en ningún breakpoint.
Prueba con: `document.documentElement.style.overflow = 'hidden'` y verifica.

---

## TAREA 10 — CONECTAR CARRITO A PRODUCTO Y CHECKOUT

### En ProductDetail (página /producto/[slug]):

```
- El botón "Agregar al carrito" llama a useCarritoStore().agregarItem()
- Después de agregar: abrir el CarritoDrawer automáticamente (useUIStore().abrirCarrito())
- Feedback visual: el botón cambia a "¡Agregado!" por 2 segundos (checkmark + verde)
```

### En /reservar:

```
- Leer los items del carrito con useCarritoStore()
- Si el carrito está vacío: redirigir a /coleccion con mensaje "Agrega productos primero"
- El Stepper debe guardar el progreso en estado local (useState)
- Al completar el paso 4: llamar useCarritoStore().vaciarCarrito() + mostrar confirmación
```

---

## ORDEN DE EJECUCIÓN

```
1. npm install framer-motion zustand
2. Crear lib/store/carritoStore.ts
3. Crear lib/store/uiStore.ts
4. Crear CarritoDrawer + integrarlo en layout.tsx
5. Crear BusquedaModal + integrarlo en layout.tsx
6. Crear UsuarioMenu + integrarlo en Header
7. Arreglar rutas Alquiler/Compra
8. Rediseñar HeroSection con split + animaciones
9. Agregar animaciones whileInView a todas las secciones del home
10. ProcessSection con línea animada
11. Header scroll-aware (transparente → sólido)
12. Mejorar ProductCard hover
13. Verificar responsive en 375px / 768px / 1024px
14. Conectar carrito a ProductDetail y /reservar
15. npm run build — confirmar 0 errores
```

---

## REGLAS DE ESTA SESIÓN

- Todos los colores desde `var(--lb-*)` — nunca hardcodeados
- Animaciones: `var(--lb-dur-*)` y `var(--lb-ease-*)` donde sea posible
- Framer motion solo donde realmente aporta — no animar todo sin sentido
- Ninguna animación debe durar más de 700ms (se siente pesado)
- `'use client'` solo en componentes que usan hooks de browser (store, scroll, eventos)
- Componentes de servidor (`async`) para páginas que solo leen datos
- Todo el texto visible al usuario en español

---

## REPORTE FINAL ESPERADO

```
ESTADO
======
[ ] zustand + framer-motion instalados
[ ] carritoStore + uiStore creados
[ ] CarritoDrawer funcional (agregar/quitar/cantidad)
[ ] BusquedaModal funcional (filtra sobre PRENDAS_MOCK)
[ ] UsuarioMenu dropdown (UI preparada, sin auth real)
[ ] Rutas /alquiler y /compra funcionando
[ ] HeroSection rediseñado con split + animaciones
[ ] Todas las secciones del home con whileInView
[ ] ProcessSection con línea animada
[ ] Header scroll-aware
[ ] ProductCard hover mejorado
[ ] Responsive 375px / 768px / 1024px verificado
[ ] Carrito conectado a ProductDetail y /reservar
[ ] Build limpio 0 errores TypeScript

PENDIENTE PARA PRÓXIMA SESIÓN
==============================
[ fotos reales de productos ]
[ autenticación de usuarios ]
[ conexión con ERP en :7000 ]
```
