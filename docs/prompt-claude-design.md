# PROMPT PARA CLAUDE DESIGN — SISTEMA DE DISEÑO LUCEBIEN 360

> Copia y pega este prompt completo en Claude Design (o cualquier herramienta de diseño AI).
> Es autocontenido: no requiere contexto previo.

---

## ROL Y OBJETIVO

Eres el diseñador principal de **LuceBien 360**, un e-commerce + ERP para una empresa peruana de alquiler y confección de trajes formales. Tu misión es definir y entregar el **sistema de diseño completo** de la marca, listo para que un desarrollador frontend lo implemente en Next.js.

El sistema debe cubrir dos superficies distintas pero de la misma marca:
1. **Web pública (e-commerce)** — para clientes finales, modo claro (light mode).
2. **ERP interno** — para operarios y administradores, modo oscuro (dark mode navy).

---

## CONTEXTO DE LA EMPRESA

**LuceBien** — alquiler, venta y confección de trajes formales (ternos) en Arequipa, Perú.
- Tagline oficial: **"Para la Ocasión"**
- Operan 3 tiendas físicas + almacén central.
- Clientes: hombres que necesitan verse bien en eventos importantes (bodas, graduaciones, corporativos).
- Propuesta de valor: elegancia accesible. Lujo sin exclusividad.

### Personalidad de marca
- **Elegante pero accesible** — no intimidante, no ostentoso.
- **Confianza artesanal** — décadas de oficio, manos que conocen la tela.
- **Precisión** — cada prenda en su talla, a tiempo.
- **Orgullo local peruano** — no imita marcas extranjeras.

---

## LOS LOGOS (ACTIVOS EXISTENTES)

La empresa ya tiene logos finalizados. Describe tu sistema en base a estos:

### Elementos del logo

**1. El Sello del León (Isotipo)**
Un león geométrico/minimalista usando corbatín, enmarcado por un borde en zigzag que imita el corte de tijera dentada (pinking shears) de sastrería. Incluye el monograma "LB" en la esquina inferior derecha. El conjunto evoca un timbre postal o sello de garantía — transmite autenticidad y tradición artesanal.

**2. El Wordmark (Logotipo)**
"LUCE" en serif fino/light + "BIEN" en serif ultra-bold. Alto contraste deliberado, estilo masthead de revista de moda (similar a Vogue o GQ). Debajo, el tagline "Para la Ocasión" en sans-serif ligero.

**3. Versiones disponibles**
- Logo completo (sello + wordmark): color, negro, blanco
- Solo el sello del león: color, negro, blanco, escala de grises
- Solo el wordmark + tagline: negro, blanco

### Color del logo en versión color
- Fondo del sello: **dorado/mostaza** (hex aproximado `#b8a515`)
- Líneas del león y borde zigzag: negro
- Wordmark: negro sobre fondo claro / blanco sobre fondo oscuro

---

## PALETA CROMÁTICA (YA DEFINIDA — RESPETAR EXACTAMENTE)

### Colores primarios de marca

```
Navy principal:   #2e3e6e
Navy claro:       #3a4f8a
Navy oscuro:      #1e2a4a
Navy profundo:    #141c33

Gold:             #b8a515
Gold claro:       #d4bf1e
Gold oscuro:      #8a7c10
Gold pálido:      rgba(184, 165, 21, 0.10)
```

### Neutros — Web E-commerce (light mode)

```
Fondo principal:  #f8f7f4   (blanco cálido, no blanco puro)
Fondo cards:      #f0ede6   (crema)
Texto principal:  #1a1a1a   (no negro puro)
Texto secundario: #6b7280
Bordes:           rgba(46, 62, 110, 0.10)
Blanco:           #ffffff   (solo para cards y superficies)
```

### Neutros — ERP Interno (dark mode)

```
Fondo base:       #0f1623
Card:             #1a2540
Superficie:       #1e2a4a
Borde:            rgba(255, 255, 255, 0.08)
Texto principal:  #e8eaf0
Texto secundario: rgba(232, 234, 240, 0.60)
```

### Semánticos (ambas superficies)

```
Éxito:      #2d9e6b
Advertencia: #e08c1a
Error:       #c94040
Info:        #3a7fc1
```

### Paleta de estados de prenda (ERP Kanban)

```
Recepción:   #6c7cbb
Lavado:      #4a9fd4
Empatado:    #7bc47f
Refacción:   #e0a020
Compostura:  #d06030
Planchado:   #9b7fd4
Control QC:  #4bbfaa
Listo:       #2d9e6b
Enviado:     #b8a515
En cliente:  #141c33
```

---

## TIPOGRAFÍA (YA DEFINIDA — RESPETAR EXACTAMENTE)

| Rol | Fuente | Uso exclusivo |
|---|---|---|
| Display / Marca | **Cormorant Garamond** | Logo, títulos hero e-commerce, precio destacado. NUNCA en UI densa. |
| Cuerpo / UI | **Inter** | TODO lo demás: botones, labels, párrafos, formularios, tablas |
| Datos / Técnico | **JetBrains Mono** | Códigos de prenda, precios en tablas, fechas, contadores |

### Escala tipográfica

```
text-4xl:  2.25rem  — Títulos hero
text-3xl:  1.875rem — H1 de sección
text-2xl:  1.5rem   — H2, títulos card
text-xl:   1.25rem  — H3, precios destacados
text-lg:   1.125rem — Subtítulos
text-base: 1rem     — Cuerpo
text-sm:   0.875rem — UI densa, labels
text-xs:   0.75rem  — Badges, metadatos
```

### Pesos de Inter

- 700 Bold → títulos, CTAs, precios
- 600 Semibold → subtítulos, labels importantes
- 400 Regular → texto cuerpo
- 300 Light → taglines, notas

---

## EL MOTIVO GRÁFICO: EL ZIGZAG (PINKING SHEAR)

El borde en zigzag del sello es el elemento gráfico más diferenciador de la marca. Representa el **corte de tijera dentada** (pinking shears) de la sastrería.

**Úsalo en:**
- Separadores de sección en la web (línea zigzag fina en gold)
- Bordes decorativos de cards de producto
- Textura de fondo muy sutil (3-5% opacidad) en secciones especiales
- Etiquetas físicas de las prendas

**Nunca:** como fondo dominante ni en todos lados simultáneamente.

---

## ESPACIADO Y RADIOS

### Escala de espaciado (base 4px)

```
space-1:  0.25rem  (4px)
space-2:  0.5rem   (8px)
space-3:  0.75rem  (12px)
space-4:  1rem     (16px)
space-6:  1.5rem   (24px)
space-8:  2rem     (32px)
space-12: 3rem     (48px)
space-16: 4rem     (64px)
space-24: 6rem     (96px)
```

### Radios de borde

```
radius-sm:   4px   — inputs, badges, tags
radius-md:   8px   — cards ERP, botones
radius-lg:   12px  — cards e-commerce, modales
radius-xl:   20px  — pills, chips
radius-full: 9999px — avatares, badges circulares
```

### Sombras

```
shadow-sm:   0 1px 3px rgba(0,0,0,.12)
shadow-md:   0 4px 16px rgba(0,0,0,.18)
shadow-lg:   0 8px 32px rgba(0,0,0,.24)
shadow-gold: 0 4px 20px rgba(184,165,21,.20)  — hover en CTAs premium
```

---

## ICONOGRAFÍA

- Familia: **Lucide Icons** o **Phosphor Icons**
- Estilo: trazo (outline), no rellenos
- Peso del trazo: 1.5px consistente
- Tamaños: 16px (inline), 20px (UI), 24px (acciones), 32px (features)

---

## TONO Y VOZ

| Contexto | Tono | Ejemplo correcto |
|---|---|---|
| Web / cliente | Elegante, cálido, aspiracional | "Luce impecable en tu gran día." |
| ERP / operarios | Directo, sin adornos | "Prenda enviada a tienda." |
| Errores web | Amable, nunca técnico | "No encontramos ese producto." |
| Confirmaciones | Preciso, positivo | "Reserva confirmada para el 15 de junio." |

**Reglas fijas:**
- Nombre: siempre **LuceBien** (una palabra, L y B en mayúscula)
- Precio: formato **S/ 120** (símbolo sol primero)
- Vocabulario: "terno", "saco", "pantalón de vestir" — no "tux" ni "smoking"

---

## ENTREGABLES REQUERIDOS

Genera cada uno de los siguientes elementos del sistema de diseño:

---

### 1. TOKENS DE DISEÑO — archivo CSS completo

Genera un archivo `tokens.css` con **todas** las variables CSS custom properties para:
- Colores (todos los definidos arriba)
- Tipografía (familias, escala, pesos)
- Espaciado
- Radios
- Sombras
- Transiciones estándar (duración y easing)
- Z-index escala

---

### 2. COMPONENTES BASE — E-COMMERCE (light mode)

Para cada componente, genera el **HTML + CSS** (Tailwind o CSS puro):

#### A. Botones
- `btn-primary` — fondo navy, texto blanco, hover con borde gold brillante
- `btn-secondary` — borde navy, fondo transparente, hover fondo navy/5%
- `btn-gold` — fondo gold, texto navy dark, solo para CTAs premium
- `btn-ghost` — sin borde, solo texto, hover subrayado gold
- Estados: default, hover, active, disabled, loading (spinner)
- Tamaños: sm, md, lg

#### B. Cards de Producto
- Imagen del terno (proporción 3:4 vertical)
- Badge de disponibilidad (disponible / últimas unidades / agotado)
- Nombre del producto
- Descripción corta (1 línea, truncado)
- Precio de alquiler + precio de venta (si aplica)
- CTA "Reservar" o "Ver detalles"
- Hover: sombra elevada + línea gold inferior
- Variante "destacado" con borde gold sutil

#### C. Navegación / Header Web
- Logo `LuceBien` a la izquierda
- Menú central: Colección / Alquiler / Compra / Nosotros / Contacto
- Derecha: Buscador (icono) + Carrito (con badge contador) + Cuenta
- Sticky con blur backdrop en scroll
- Mobile: hamburger menu con drawer lateral
- Franja superior (opcional): "Envío gratis a Arequipa en pedidos +S/200"

#### D. Footer Web
- Logo + tagline
- Columnas: Colección / La Empresa / Ayuda / Contacto
- Redes sociales (íconos)
- Dirección física de tiendas
- Copyright
- Separador con motivo zigzag gold arriba

#### E. Inputs y Formularios
- Input text estándar
- Input con icono izquierdo (búsqueda, ubicación)
- Select / Dropdown
- Checkbox y Radio (estilo navy/gold)
- Estados: default, focus (borde navy), error (borde rojo + mensaje), success (borde verde)
- Label flotante (float label effect)

#### F. Badges y Tags
- Disponibilidad: verde/amarillo/rojo
- Categoría de prenda: pill navy outline
- "Nuevo", "Popular", "Oferta": pill gold
- Talla: cuadrado con borde

#### G. Modal / Drawer
- Modal centrado con overlay oscuro
- Drawer lateral (para filtros y carrito)
- Header del modal con título + botón cerrar (X)
- Zona de contenido con scroll interno
- Footer de modal con CTAs

#### H. Notificaciones / Toast
- Éxito (verde): "Reserva confirmada"
- Error (rojo): "No hay disponibilidad para esa fecha"
- Info (azul): "Tu terno estará listo el viernes"
- Posición: esquina superior derecha, apilables

---

### 3. SECCIONES DE LA HOME — E-COMMERCE

Diseña el layout y contenido de referencia para cada sección:

#### A. Hero Section
- Fondo: imagen fotográfica de alta calidad (hombre vestido elegantemente en evento) con overlay navy oscuro gradiente
- Título: "Para la Ocasión" en Cormorant Garamond grande
- Subtítulo: "Alquila o compra el terno perfecto para tu momento especial" en Inter
- CTAs: "Ver colección" (btn-primary) + "¿Cómo funciona?" (btn-ghost)
- Badge flotante: "Disponible en 3 tiendas en Arequipa"

#### B. Categorías / Colección
- Grid 3-4 columnas de categorías: Terno Completo / Saco / Pantalón / Accesorios
- Cada card: imagen, nombre, rango de precio desde S/ X
- Efecto hover con overlay gold sutil

#### C. Proceso "¿Cómo funciona?"
- 4 pasos horizontales con número + icono + descripción
- Paso 1: Elige tu terno
- Paso 2: Reserva en línea o visítanos
- Paso 3: Prueba y ajusta en tienda
- Paso 4: Luce impecable
- Separadores con el motivo zigzag

#### D. Productos Destacados
- Título de sección
- Grid 4 columnas (desktop) / 2 columnas (tablet) / 1 columna (mobile)
- Cards de producto (definidas en componente B)
- CTA "Ver toda la colección"

#### E. Sección "¿Por qué LuceBien?"
- 3 columnas con íconos grandes
- Propuesta 1: "Más de X años de experiencia"
- Propuesta 2: "Ajuste perfecto garantizado"
- Propuesta 3: "Recojo en tienda o delivery"
- Fondo: crema `#f0ede6` para diferenciar de la sección anterior

#### F. Sección de Sedes
- Mapa o cards de las 3 tiendas
- Cada card: nombre sede, dirección, horario, teléfono, botón "Ver en mapa"
- Foto de la tienda si disponible

#### G. Testimonios / Reseñas
- Cards de clientes: foto, nombre, evento, texto corto
- Rating en estrellas gold
- Carrusel o grid 3 columnas

---

### 4. PÁGINAS INTERNAS — E-COMMERCE

#### A. Página de Producto
- Galería de imágenes (principal + miniaturas)
- Nombre del producto
- Código de referencia en JetBrains Mono
- Precio alquiler / precio venta
- Selector de talla con guía de tallas
- Selector de fecha (para alquiler)
- Disponibilidad en tiempo real por sede
- Botón "Reservar" (btn-gold, grande)
- Acordeón: Descripción / Materiales / Cuidados / Política de alquiler
- Productos relacionados

#### B. Carrito
- Lista de ítems con imagen thumb, nombre, talla, precio
- Resumen del pedido con desglose
- Código de descuento
- Total en grande
- CTA "Proceder al pago"
- Opción "Continuar comprando"

#### C. Página de Reserva / Checkout
- Paso 1: Datos personales (nombre, DNI, teléfono, email)
- Paso 2: Tipo de entrega (recoger en tienda / delivery)
- Paso 3: Fecha del evento
- Paso 4: Confirmación y pago
- Resumen lateral sticky
- Indicador de pasos (stepper)

---

### 5. COMPONENTES ERP INTERNO (dark mode navy)

#### A. Sidebar
- Fondo: `#141c33`
- Logo en versión blanca arriba
- Items de navegación con icono + label
- Item activo: fondo `rgba(184,165,21,.10)`, borde izquierdo gold 3px
- Hover: fondo `rgba(255,255,255,.04)`
- Selector de sede como pill interactivo
- Botón colapsar abajo

#### B. Header ERP
- Fondo: `#1a2540` con borde inferior `rgba(255,255,255,.06)`
- Izquierda: breadcrumb o título de página
- Derecha: reloj digital (JetBrains Mono) + estado turno + campana notificaciones + avatar

#### C. Kanban de Prendas
- Columnas por estado de prenda (usando la paleta de estados definida)
- Cards con: código prenda, tipo, color, operario asignado, tiempo en estado
- Drag and drop visual
- Badge de cantidad por columna
- Barra de búsqueda y filtros encima

#### D. Tablas de Datos
- Header: fondo `#1e2a4a`, texto `#e8eaf0`
- Filas alternadas: `#1a2540` / `#161d30`
- Hover fila: `rgba(184,165,21,.05)`
- Columna de acciones con íconos
- Paginación abajo
- Filtros y búsqueda arriba

#### E. Cards KPI / Métricas
- Número grande en JetBrains Mono
- Label descriptivo
- Delta vs ayer (▲ verde / ▼ rojo / • gris)
- Icono de contexto
- Borde izquierdo gold o del color semántico correspondiente

#### F. Formularios ERP
- Inputs en dark: fondo `#0f1623`, borde `rgba(255,255,255,.12)`, texto `#e8eaf0`
- Focus: borde gold
- Labels: `rgba(232,234,240,.70)`

---

### 6. SISTEMA DE ICONOS PARA ERP

Define el set mínimo de iconos necesarios (Lucide) para cada módulo:

- Pipeline / Prendas: shirt, package, tag, qr-code, barcode
- Evaluaciones: star, chart-bar, clipboard-check, award
- Empleados: users, user-plus, id-card, calendar
- Inventario: box, layers, archive, scan
- Reportes: file-text, download, filter, sort
- Notificaciones: bell, bell-dot, check-circle, alert-triangle
- Navegación: chevron-right, chevron-down, menu, x, search
- Acciones: edit, trash, eye, copy, send, plus, minus

---

### 7. GUÍA DE ANIMACIONES

Define las transiciones y animaciones permitidas:

```
Duración estándar: 150ms  — cambios de color, hover
Duración media:    250ms  — aparición de dropdowns, tooltips
Duración larga:    350ms  — modales, drawers, transiciones de página

Easing:
  ease-out:        cubic-bezier(0, 0, 0.2, 1)  — elementos que aparecen
  ease-in:         cubic-bezier(0.4, 0, 1, 1)  — elementos que desaparecen
  ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1) — transformaciones
```

**Animaciones permitidas:**
- fade-in / fade-out
- slide-up (modal, toast)
- slide-left / slide-right (drawer)
- scale-in (hover en cards)
- pulse (indicador de estado activo)

**Prohibidas:**
- bounce, shake, flip, rotate decorativo
- Partículas, confeti, explosiones
- Cualquier animación que dure más de 500ms sin ser de carga

---

### 8. BREAKPOINTS Y DISEÑO RESPONSIVE

```
mobile:   < 640px    — 1 columna, nav hamburger
tablet:   640-1024px — 2 columnas, nav compacto
desktop:  > 1024px   — grid completo, nav expandido
wide:     > 1280px   — máximo ancho contenido: 1200px centrado
```

**Comportamiento específico:**
- Header web: menú horizontal en desktop → hamburger en mobile
- Grid de productos: 4 col → 2 col → 1 col
- Sidebar ERP: siempre visible colapsado/expandido en desktop, drawer en mobile
- Cards KPI: 4 col → 2 col → 1 col

---

### 9. VARIABLES CSS — ARCHIVO FINAL COMPLETO

Genera el archivo `design-tokens.css` consolidado con TODOS los tokens en formato custom properties CSS, organizado en secciones comentadas. Debe poder importarse en cualquier proyecto (Next.js o Express) y ser la fuente única de verdad del diseño.

---

### 10. CHECKLIST DE CONSISTENCIA

Al terminar, verifica:
- [ ] Todos los colores usan las variables, no valores hardcodeados
- [ ] Ningún texto usa serifas en UI densa
- [ ] JetBrains Mono solo en números/códigos
- [ ] Cormorant Garamond solo en hero y display
- [ ] Todos los estados interactivos (hover, focus, active) están definidos
- [ ] Contraste WCAG AA mínimo en todos los textos sobre fondo
- [ ] El motivo zigzag aparece al menos en header/footer web
- [ ] El tono es elegante pero no frío en todos los copy de ejemplo
- [ ] Precios siempre con formato "S/ 000"

---

## NOTAS FINALES PARA EL DISEÑADOR

1. **La marca es seria, no aburrida.** Hay personalidad en el contraste del wordmark y en el sello del león. Úsala.
2. **El zigzag ES la marca.** Es el diferenciador. Cualquier aplicación que lo integre se siente "LuceBien" inmediatamente.
3. **El gold es un acento, no un fondo.** Menos es más. Un detalle gold vale más que todo en gold.
4. **Light mode en la web no significa genérico.** El fondo `#f8f7f4` (blanco cálido) ya diferencia de cualquier web genérica.
5. **Los operarios del almacén usan el ERP en pantallas mediocres con luz artificial.** Prioriza legibilidad sobre estética en el dark mode.
6. **Los clientes web son peruanos de ciudad comprando para eventos especiales.** La emoción (verse bien en ese momento) importa más que los features técnicos.
