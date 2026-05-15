# GRUPO 4 — E-commerce Web (Componentes y Páginas)
## Prompt A: Componentes del Catálogo Web

```
Diseña la librería de componentes del e-commerce web de LUCEBIEN / CASA DE LOS TERNOS:

EMPRESA: Alquiler y venta de ternos formales masculinos. Sedes en Huancayo, Perú.
SERVICIOS: Alquiler de ternos, venta de ternos, confección a medida, accesorios (corbatas, moños, pañuelos)
PÚBLICO: Hombres 20–55 años buscando formalwear para matrimonios, graduaciones, galas, eventos corporativos
URL objetivo: lucebien.com

PALETA: navy #0A1628, gold #C8A24B, cream #F5F0E8, gray #6B7280
TIPOGRAFÍA: Display — Cormorant Garamond | UI — Montserrat

COMPONENTES A DISEÑAR:

1. CARDS DE PRENDA (los más importantes)
   Variantes:
   a) Card de catálogo grid (280×380px): foto de terno, badge de categoría (ALQUILER/VENTA/NUEVO), nombre del modelo, precio alquiler y/o venta, colores disponibles (puntos), botón "Ver detalle" — hover: zoom sutil de imagen, overlay gold
   b) Card de catálogo lista (horizontal, 100% ancho): foto pequeña, más detalles visibles (tela, talla disponible, sede donde está disponible)
   c) Card destacada/hero (grande, para "Colección Destacada"): imagen a doble altura, nombre con tipografía display
   d) Card mini (para carrito y wishlist): foto muy pequeña, nombre, precio, controles de cantidad, botón eliminar

2. NAVBAR
   - Desktop: logo izquierda | links centro (Alquiler, Compra, Colecciones, Confección, Contacto) | íconos derecha (búsqueda, carrito con badge, usuario)
   - Mobile: hamburger + logo centrado + carrito
   - Sticky con backdrop blur al hacer scroll
   - Indicador de sede seleccionada (dropdown pequeño junto a logo)
   - Estado: default, scrolled (con sombra y fondo opaco navy), mobile-open

3. HERO SECTION (para landing)
   - Fondo: terno elegante en ambiente formal (fotografía oscura, alta calidad)
   - Overlay navy semi-transparente
   - Tagline en Cormorant Garamond Display: 2 líneas máximo
   - Subtítulo en Montserrat Light
   - 2 CTAs: "Ver Colección" (gold) + "Reservar Cita" (outline blanco)
   - Badge flotante: "4 sedes en Huancayo"
   - Scroll indicator animado (flecha o punto parpadeante)

4. FILTROS Y BÚSQUEDA
   - Filter bar horizontal: chips de categoría (Todos, Clásico, Slim Fit, Italiano, Eventos), dropdown de color, dropdown de talla, precio range slider, toggle Alquiler/Venta
   - Search modal: overlay oscuro, barra central, resultados instantáneos mostrando mini-cards de prendas
   - Resultados vacíos: ilustración del León mascota + mensaje sugerente

5. CARRITO DRAWER
   - Slide-in desde la derecha (400px ancho en desktop, full en mobile)
   - Lista de items con card mini
   - Resumen: subtotal, tipo (alquiler/venta), sede seleccionada para recojo
   - Campo de fecha de evento (para alquiler)
   - Botón "Ir al checkout" en gold, prominente
   - Botón "Continuar viendo" como texto link

6. SELECTOR DE SEDE
   - Mapa estilizado o lista de las 4 sedes reales:
     * Lucebien — Real 380 (cerca a 2 de Mayo)
     * Stand 101-102 — Real 326, galería La Casa de los Ternos
     * Trece — [dirección]
   - Indicador de disponibilidad por sede (disponible / pocas unidades / agotado)
   - Botón "Confirmar sede" en gold

7. FOOTER
   - Columnas: logo + tagline | Servicios | Sedes | Contacto | Redes
   - Sedes con direcciones reales (Real 380, Real 326)
   - Número WhatsApp visible
   - Badge "Hecho en Huancayo" 
   - Copyright "© 2026 LUCEBIEN / CASA DE LOS TERNOS"
   - Borde superior con el motivo de zigzag/festón (elemento de identidad de la marca)
```

---

## Prompt B: Páginas Principales Web

```
Diseña mockups de alta fidelidad de las páginas clave del e-commerce de LUCEBIEN / CASA DE LOS TERNOS:

EMPRESA: Alquiler y venta de ternos formales masculinos. 4 sedes en Huancayo, Perú.
SERVICIOS: Alquiler, venta, confección a medida, accesorios

PALETA: navy #0A1628, gold #C8A24B, cream #F5F0E8
TIPOGRAFÍA: Cormorant Garamond (display/heroes) + Montserrat (UI/body)
RESOLUCIÓN: 1440px desktop | 390px mobile (mostrar ambas versiones)

PÁGINAS A DISEÑAR:

1. LANDING PAGE — SCROLLYTELLING (desktop + mobile)
   Sección 1 — Hero full-screen:
   - Fondo oscuro con terno elegante
   - Wordmark LUCEBIEN animado (entra desde abajo)
   - Tagline: "El traje que cuenta tu historia"
   - 2 CTAs: Alquiler | Compra
   - Flecha de scroll animada

   Sección 2 — ¿Quiénes somos? (aparece al hacer scroll):
   - Texto: "Más de [X] años vistiendo los momentos más importantes de Huancayo"
   - 3 íconos con estadísticas: sedes, ternos disponibles, eventos vestidos
   - Foto de la tienda principal (Real 380)

   Sección 3 — Nuestros servicios (cards aparecen en cascada):
   - Alquiler (con precio desde S/ XX)
   - Venta (nuevo y usado)
   - Confección a medida
   - Accesorios (corbatas, moños, pañuelos, mancuernillas)

   Sección 4 — Colección destacada (slider horizontal):
   - 4–6 cards de ternos con el scroll parallax en la imagen
   - Botón "Ver catálogo completo"

   Sección 5 — Proceso de alquiler (pasos animados):
   1. Elige tu terno
   2. Selecciona fecha de evento y sede
   3. Recoge en tienda
   4. Devuelve limpio

   Sección 6 — Sedes (mapa + cards):
   - 3 sedes con dirección real, horario, teléfono
   - CTA WhatsApp para consultas

   Sección 7 — Testimonios:
   - Cards de reseñas con foto, nombre, evento, calificación estrellas

   Footer completo

2. PÁGINA DE DETALLE DE PRENDA (desktop)
   - Galería: imagen principal grande izquierda + thumbnails verticales
   - Info derecha: nombre del modelo, badges (ALQUILER / VENTA / AMBOS), precio alquiler, precio venta
   - Selector de talla con guía de tallas
   - Selector de color (muestra los disponibles en esa prenda)
   - Disponibilidad por sede: tabla con las 3 tiendas y disponibilidad
   - Para alquiler: selector de fecha de evento, fecha de entrega (calculada), fecha de devolución
   - Botón "Reservar/Agregar al carrito" en gold
   - Tabs: Descripción | Materiales | Cuidados | Política de alquiler
   - Sección: "Completa tu look" (accesorios relacionados)
   - Sección: "También te puede gustar" (otros ternos)

3. PÁGINA DE CHECKOUT (desktop)
   Paso 1 — Resumen y datos:
   - Lista de items (con foto mini), subtotal
   - Datos del cliente: nombre, DNI, celular, email
   - Tipo de entrega: Recojo en tienda (selector de sede) / Delivery (solo Huancayo)
   
   Paso 2 — Fechas (si es alquiler):
   - Calendar picker de fecha de evento
   - Fecha de entrega y devolución calculadas automáticamente
   - Resumen de días y cargo por día extra si aplica
   
   Paso 3 — Pago:
   - Opciones: Efectivo en tienda, Transferencia, Yape/Plin
   - Resumen final del pedido
   - Botón "Confirmar pedido" gold
   - Nota: "Te contactaremos por WhatsApp para confirmar disponibilidad"
```
