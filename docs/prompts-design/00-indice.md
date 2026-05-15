# Prompts Claude Design — LUCEBIEN / CASA DE LOS TERNOS
## Índice de prompts individuales agrupados por tema

> Información base extraída de los documentos reales de la empresa (mayo 2026).
> Sedes reales: Lucebien (Real 380), Stand 101-102 (Real 326), Trece, Almacén Central — Huancayo, Perú.
> Sistemas: TUXEDO (POS comercial existente) + SCI-LB (ERP interno en desarrollo).

---

### GRUPO 1 — Identidad Base
**Archivo:** `01-identidad-base.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Variantes del logotipo (9 versiones: dark, light, mono, icónico, escudo) |
| B | Mascota León con Moño (4 variantes + integrado en escudo) |

---

### GRUPO 2 — Sistema de Color y Tipografía
**Archivo:** `02-color-y-tipografia.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Paleta extendida + tokens semánticos (escalas 50–900, pares WCAG) |
| B | Sistema tipográfico completo (escala, pairings, uso en ERP vs. web) |

---

### GRUPO 3 — Componentes ERP (SCI-LB)
**Archivo:** `03-componentes-erp-sciLB.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Librería de componentes UI: botones, badges de proceso almacén, inputs, cards, tablas, sidebar con secciones reales |
| B | Mockups de pantallas: Reporte de Actividades, Pipeline de Prendas en Almacén, Dashboard Admin, Solicitudes |

---

### GRUPO 4 — E-commerce Web
**Archivo:** `04-ecommerce-web.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Componentes web: cards de prenda, navbar, hero, filtros, carrito drawer, selector de sede, footer |
| B | Páginas: Landing scrollytelling completo, Detalle de prenda, Checkout 3 pasos |

---

### GRUPO 5 — Materiales Físicos
**Archivo:** `05-materiales-fisicos.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Etiqueta de prenda con QR (cara frontal/posterior, 4 variantes incluyendo accesorios) |
| B | Tarjeta de presentación, bolsa de entrega, recibo de alquiler A5, boleta interna entre sedes |

---

### GRUPO 6 — Redes Sociales y WhatsApp
**Archivo:** `06-redes-sociales.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Kit Instagram/Facebook: posts (4 variantes), Stories (3 variantes), portada FB, highlights covers, fotos de perfil |
| B | WhatsApp Business: perfil, catálogo de producto, tarjeta de confirmación, mockup de chat, status |

---

### GRUPO 7 — Uniformes e Identidad de Espacio Físico
**Archivo:** `07-uniformes-y-espacio.md`

| Prompt | Qué pedir a Claude Design |
|--------|--------------------------|
| A | Uniformes: vendedor/asesora (H+M), almacén, gorra, credencial/ID badge |
| B | Señalética: fachada exterior, señales interiores, mural de pared, displays de mostrador, packaging |

---

## Orden recomendado de ejecución

```
Sesión 1 → Grupo 1 (Identidad): primero el León, luego los logos con el León ya definido
Sesión 2 → Grupo 2 (Tokens): define la paleta antes de hacer componentes
Sesión 3 → Grupo 3A (Componentes ERP): con tokens ya definidos
Sesión 4 → Grupo 3B (Pantallas ERP): con componentes ya listos
Sesión 5 → Grupo 4A (Componentes Web): comparte paleta y tipografía del Grupo 2
Sesión 6 → Grupo 4B (Páginas Web): con componentes web ya definidos
Sesión 7 → Grupo 5 (Materiales físicos): pueden hacerse en paralelo con el resto
Sesión 8 → Grupo 6 (Redes sociales): puede hacerse en cualquier momento post-Grupo 1
Sesión 9 → Grupo 7 (Uniformes/espacio): puede hacerse en paralelo con el resto
```

## Consejo de uso

Cada prompt está diseñado para una sesión individual de Claude Design.
Si Claude Design te pide aclarar información de la empresa, usa estos datos reales:
- **Nombre comercial:** LUCEBIEN / CASA DE LOS TERNOS
- **Rubro:** Alquiler, venta y confección de ternos formales masculinos
- **Ciudad:** Huancayo, Perú
- **Sedes:** Real 380 (Lucebien principal) | Real 326 galería La Casa de los Ternos (Stand 101-102) | Trece | Almacén Central
- **Servicios:** Alquiler, venta, confección a medida, compostura, accesorios
- **Paleta base:** navy #0A1628 | gold #C8A24B | cream #F5F0E8
