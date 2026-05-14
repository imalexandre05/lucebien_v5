# PROMPT PARA CLAUDE DESIGN — FASE 2
## Mockups de páginas web + Etiqueta física de prenda + Kit social

> Usa el skill: Frontend design
> Tienes el sistema de diseño completo de la sesión anterior.
> Este prompt extiende ese trabajo — no reemplaza nada, solo agrega.

---

## CONTEXTO (leer antes de diseñar)

**LuceBien** — alquiler y venta de trajes formales en Arequipa, Perú.
Tagline: "Para la Ocasión" · Nombre siempre: LuceBien (L y B en mayúscula)

**Sistema de diseño ya definido:**
- Colores: navy `#2e3e6e` + gold `#b8a515` + fondo crema `#f8f7f4`
- Fuentes: Cormorant Garamond (display/hero) · Inter (UI) · JetBrains Mono (números/códigos)
- Motivo clave: zigzag (corte de tijera dentada de sastrería) como separador gold
- Logo: León con corbatín en marco zigzag + wordmark LUCE(fino)BIEN(bold)
- Precio siempre en formato: S/ 120
- Modo claro para web pública · Modo oscuro navy para ERP interno

---

## ENTREGABLE 1 — MOCKUPS COMPLETOS DE LA WEB (PRIORIDAD ALTA)

El desarrollador está construyendo el sitio en Next.js. Necesita mockups detallados como referencia visual para no improvisar decisiones de diseño.

### 1A. Landing Page — versión desktop (1280px) y mobile (375px)

Diseña el scroll completo de la home con todas las secciones en orden:

**Sección 1 — Hero**
```
Desktop (split 2 columnas):
  Izquierda:
    · Eyebrow: "AREQUIPA · PERÚ" en Cormorant tracking ancho, gold, pequeño
    · H1 enorme: "Para la" (blanco fino) + salto de línea + "Ocasión" (gold, bold)
      Fuente: Cormorant Garamond, ~72px, line-height 1.0
    · Párrafo corto: Inter regular, blanco 80% opacidad
    · 2 CTAs en fila: "Ver colección" (botón gold) + "¿Cómo funciona?" (ghost, borde blanco)
    · Badge pill abajo: "3 tiendas · Desde S/ 80" con ícono ubicación

  Derecha:
    · Rectángulo elegante (proporción 4:5)
    · Fondo: gradient gold muy oscuro
    · Sello del León centrado (logo_lion_white) grande
    · Texto superpuesto abajo: nombre del producto + precio
    · Borde del rectángulo: zigzag o clip-path con el motivo de la marca

  Fondo general del hero: navy oscuro con grain/texture sutil

Mobile (375px, 1 columna):
  · Solo la columna de texto, centrada
  · H1 más pequeño (~42px)
  · CTAs en columna
  · Sin el bloque de producto derecho
```

**Sección 2 — Categorías**
```
4 cards en grid (2x2 mobile, 4x1 desktop):
  Cada card:
    · Imagen de fondo con overlay navy 60%
    · Nombre de categoría en blanco (Cormorant, bold)
    · Precio "Desde S/ XX" en gold
    · Hover: overlay se aclara, borde gold aparece, texto sube

Categorías: Terno Completo · Saco · Pantalón · Accesorios
```

**Sección 3 — Productos Destacados**
```
Título de sección con zigzag gold abajo
Grid de 4 product cards:
  Cada card:
    · Imagen 3:4 con placeholder elegante (gradient navy + ícono percha)
    · Badge "Disponible" verde top-left
    · Nombre + código (JetBrains Mono, muted)
    · "Alquiler desde S/ 120" bold
    · "Compra S/ 850" muted debajo
    · Hover: card sube, aparece botón "Reservar" desde abajo
```

**Sección 4 — ¿Cómo funciona? (Process)**
```
Fondo crema (#f0ede6)
Zigzag gold como separador arriba y abajo
4 pasos en fila horizontal con línea conectora dorada:
  [1] Ícono · "Elige" · descripción corta
  [2] Ícono · "Reserva" · descripción corta
  [3] Ícono · "Prueba" · descripción corta
  [4] Ícono · "Luce" · descripción corta
Número del paso en Cormorant grande, gold muy tenue (decorativo)
```

**Sección 5 — ¿Por qué LuceBien?**
```
3 columnas con íconos grandes (outline style):
  · "Décadas de experiencia" — ícono award/medalla
  · "Ajuste garantizado" — ícono ruler/medida
  · "3 tiendas en Arequipa" — ícono map-pin
```

**Sección 6 — Nuestras Tiendas**
```
3 cards de sedes en fila:
  Cada card:
    · Nombre de la tienda (bold)
    · Dirección y horario
    · Teléfono (JetBrains Mono)
    · Botón "Ver en mapa" (ghost small)
    · Borde superior: 3px solid var(--gold)
```

**Sección 7 — Testimonios**
```
3 cards con:
  · Comillas decorativas en gold grandes (Cormorant)
  · Texto del testimonio
  · Foto avatar circular (placeholder iniciales)
  · Nombre + "Cliente desde 20XX"
  · Estrellas rating en gold
```

**Footer**
```
Zigzag gold como separador superior
Fondo: navy profundo (#141c33)
Logo blanco + tagline "Para la Ocasión" en Cormorant italic gold
4 columnas de links
Fila de las 3 sedes con dirección
Copyright + "Hecho en Arequipa, Perú"
```

---

### 1B. Página de Producto — /producto/[slug]

```
Layout 60/40 (imagen / info):

IZQUIERDA — Galería:
  · Imagen principal grande (placeholder elegant: gradient + ícono percha + código)
  · Fila de 4 miniaturas abajo, la activa con borde gold 2px

DERECHA — Información:
  · Breadcrumb: Inicio › Colección › Terno Clásico Navy
  · Código: "LB-001" en JetBrains Mono, muted, pequeño
  · H1: nombre del producto
  · Precio alquiler: "S/ 120" en Cormorant bold, 2xl, navy
  · Precio venta: "Compra: S/ 850" Inter regular, muted, más pequeño
  · Separador zigzag muy sutil

  · "Selecciona tu talla:" label + fila de botones S M L XL XXL
    · Activo: fondo navy, texto blanco
    · Disponible: borde navy, fondo transparente
    · Agotado: tachado, gris, sin hover
  · Link "Guía de tallas →" pequeño gold bajo los botones

  · "Disponibilidad en tiendas:" mini tabla
    Tienda | Estado
    LuceBien | ● Disponible
    Stand 101-102 | ● Disponible  
    Trece | ○ Pocas unidades
    (● verde / ● amarillo / ○ rojo)

  · Fecha del evento: input con ícono calendario
    "¿Cuándo es tu evento?"

  · CTA principal: "Reservar ahora" (btn-gold, full width, large)
  · CTA secundario: "Agregar al carrito" (btn-secondary, full width)

  · Acordeón (3 items):
    › Descripción del producto
    › Materiales y cuidados
    › Política de alquiler
```

---

### 1C. Página de Colección — /coleccion

```
HEADER de página:
  · Título "Colección" con zigzag gold abajo
  · Contador: "24 productos"

LAYOUT 2 columnas:
  SIDEBAR izquierda (260px, sticky):
    · "Filtros" con botón "Limpiar"
    · Sección "Tipo":
      □ Terno Completo (12)
      □ Saco (8)
      □ Pantalón (4)
    · Sección "Operación":
      ○ Todos
      ○ Alquiler
      ○ Compra
    · Sección "Disponibilidad":
      □ Solo disponibles
    · Sección "Rango de precio":
      Slider doble S/ 80 — S/ 500

  CONTENIDO derecha:
    · Barra de ordenado: "Ordenar por: Precio ↑ ↓ / Nombre / Destacados"
    · Modos de vista: ■■ Grid / ☰ Lista (íconos toggle)
    · Grid de ProductCards (3 col desktop / 2 col tablet / 1 col mobile)

MOBILE (375px):
  · Sidebar se convierte en drawer desde abajo con botón "Filtros" sticky
  · Grid de 2 columnas, cards más compactas
```

---

### 1D. Flujo de Reserva — /reservar

```
STEPPER en el top (4 pasos):
  [1 Datos] ──── [2 Entrega] ──── [3 Fecha] ──── [4 Confirmar]
  · Paso activo: círculo gold sólido
  · Paso completado: círculo navy con check blanco
  · Paso pendiente: círculo outline gris

LAYOUT 60/40:
  IZQUIERDA — Formulario del paso activo:
    Paso 1 - Datos personales:
      · Nombre completo (input full-width)
      · DNI (input + "¿Por qué pedimos esto?")
      · Teléfono con prefijo +51
      · Email
      · Botón "Continuar →" (btn-gold)

  DERECHA — Resumen sticky:
    Card con título "Tu pedido"
    · Thumbnail del terno + nombre + talla
    · Tipo: Alquiler
    · Subtotal: S/ 120
    · Línea separadora
    · Total: S/ 120 (bold, grande)
    · Nota: "Un asesor te contactará para confirmar"
```

---

## ENTREGABLE 2 — ETIQUETA FÍSICA DE PRENDA (QR + CÓDIGO)

Este es el asset más importante para el ERP. Cada prenda del almacén llevará una etiqueta impresa.

### Especificaciones físicas
- **Tamaño:** 6cm × 9cm (impresora térmica estándar)
- **Colores:** Máximo 2 tintas (negro + gold o solo negro para impresoras B/N)
- **Debe funcionar:** en papel termal blanco, impresora estándar y etiqueta adhesiva

### Diseño de la etiqueta

```
┌─────────────────────────────┐ ← borde zigzag (pinking shear) si es posible
│                             │
│  [Logo León pequeño]  LB    │  ← logo monocromático + monograma
│  ─────────────────────────  │
│                             │
│  █████████                  │
│  █       █   LB-120         │  ← QR grande + código en JetBrains Mono bold
│  █  QR   █                  │
│  █████████   TERNO NAVY     │  ← tipo de prenda
│              TALLA: M       │  ← talla
│              COLOR: NAVY    │  ← color
│                             │
│  ─────────────────────────  │
│  LuceBien · Para la Ocasión │  ← footer tiny en Inter light
│                             │
└─────────────────────────────┘ ← borde zigzag inferior
```

### Variantes de la etiqueta

**Versión completa (color):**
- Fondo blanco
- Header con fondo gold, logo y código en negro
- QR negro
- Footer en navy muted

**Versión B/N (impresora térmica):**
- Todo en negro/gris
- Sin fondos de color
- QR grande y legible
- Código en bold para escaneo fácil

**Versión mini (4cm × 4cm) para accesorios:**
- Solo QR + código + logo pequeño
- Sin información textual extendida

---

## ENTREGABLE 3 — KIT DE REDES SOCIALES

### 3A. Post de Instagram (1080×1080px)

**Tipo 1 — Producto destacado:**
```
Fondo: gradient navy diagonal
Centro: imagen del terno (placeholder elegante)
Esquina superior: logo_lion_white pequeño
Texto inferior:
  · Nombre del terno en Cormorant grande, blanco
  · "Alquiler desde S/ 120" en gold
  · "LuceBien · Para la Ocasión" pequeño, muted
Decoración: línea zigzag gold horizontal separando texto de imagen
```

**Tipo 2 — Frase/Inspiracional:**
```
Fondo: gold sólido
Centro: texto enorme en Cormorant negro
  "El detalle
   hace la
   diferencia."
Esquina: sello del león (logo_lion_black) watermark 15% opacidad
Footer: "LuceBien · Para la Ocasión" navy
```

**Tipo 3 — Promoción:**
```
Fondo: crema (#f8f7f4)
Franja navy arriba y abajo (zigzag de separador)
Texto centrado:
  Eyebrow: "OFERTA ESPECIAL" tracking ancho, gold
  Precio tachado + precio nuevo
  CTA: "Reserva ahora · lucebien.pe"
Logo en la franja navy superior
```

### 3B. Story de Instagram (1080×1920px)

```
Parte superior (40%): fondo navy con logo centrado
Parte media (40%): contenido principal (producto o texto)
Parte inferior (20%): franja gold con CTA "Desliza hacia arriba" o link
Zigzag como transición entre franjas
```

### 3C. Portada de WhatsApp Business (1600×400px)

```
Fondo: gradient navy izquierda → navy claro derecha
Izquierda: logo_full_white centrado verticalmente
Derecha: "Alquiler y venta de ternos formales" + "Arequipa, Perú"
Franja gold de 4px en el borde inferior
```

---

## NOTAS DE DISEÑO PARA ESTA SESIÓN

1. **Coherencia con lo ya hecho:** todos los tokens, espaciados y tipografías deben ser exactamente los del sistema de diseño anterior. No inventar nuevos valores.

2. **El zigzag es el separador universal:** úsalo entre secciones diferentes. Nunca uses un `<hr>` genérico.

3. **Placeholders de imagen elegantes:** donde no hay foto real, usar un gradient navy sutil + el sello del León watermark (no dejes rectángulos vacíos grises).

4. **Prioridad de entrega:**
   - Primero: 1A (landing desktop + mobile) — el desarrollador lo necesita ya
   - Segundo: 1B (página de producto)
   - Tercero: Entregable 2 (etiqueta de prenda)
   - Cuarto: 1C, 1D, Entregable 3

5. **Exportar como standalone HTML** al finalizar para que el desarrollador lo use como referencia.
