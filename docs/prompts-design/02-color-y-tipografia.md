# GRUPO 2 — Sistema de Color y Tipografía
## Prompt A: Paleta Extendida y Tokens

```
Diseña el sistema de colores completo de LUCEBIEN / CASA DE LOS TERNOS como una página de referencia de design tokens:

EMPRESA: Alquiler, venta y confección de ternos formales. 4 sedes en Huancayo, Perú.
Público: Hombres 20–55 años para eventos formales (matrimonios, graduaciones, galas).
Tono: Serio, elegante, confiable. NO juvenil, NO festivo en exceso.

PALETA BASE (ya definida, expandir):
- --lb-navy: #0A1628 (primario, fondos oscuros, texto principal)
- --lb-gold: #C8A24B (acento premium, CTAs, highlights)
- --lb-cream: #F5F0E8 (fondos claros, tarjetas)
- --lb-gray-mid: #6B7280 (texto secundario, bordes)

ESCALA A GENERAR (mostrar como swatches con nombre y hex):
1. Navy scale: 50, 100, 200, 300, 400, 500 (#0A1628), 600, 700, 800, 900
2. Gold scale: 50, 100, 200, 300, 400, 500 (#C8A24B), 600, 700, 800, 900
3. Cream/Neutral scale: white, 50 (#F5F0E8), 100, 200, 300, 400, 500, 600, 700, 800
4. Grays: 50, 100, 200, 300, 400, 500 (#6B7280), 600, 700, 800, 900
5. Semánticos:
   - --lb-success: verde elegante (no neón)
   - --lb-warning: ámbar cálido
   - --lb-error: rojo vino
   - --lb-info: azul acero

TOKENS SEMÁNTICOS (mostrar como tabla nombre → valor):
- Background: bg-base, bg-surface, bg-overlay, bg-inverse
- Text: text-primary, text-secondary, text-muted, text-inverse, text-accent
- Border: border-default, border-strong, border-accent
- Interactive: btn-primary-bg, btn-primary-text, btn-secondary-bg, link-color, link-hover

LAYOUT DE LA PÁGINA:
- Título: "LUCEBIEN Design Tokens — Color System"
- Grid de swatches con hex, nombre del token, y ratio de contraste WCAG
- Sección de combinaciones aprobadas: mostrar 6 pares color-sobre-color con ratio AA/AAA
- Sección de combinaciones prohibidas: mostrar 3 ejemplos de mal contraste con X roja
- Footer: nota "© 2026 LUCEBIEN — Sistema de diseño interno"
```

---

## Prompt B: Sistema Tipográfico

```
Diseña la guía tipográfica completa de LUCEBIEN / CASA DE LOS TERNOS:

EMPRESA: Alquiler y venta de ternos formales, 4 sedes en Huancayo, Perú.
Tono: Elegante, serio, confiable. Formalwear masculino de alta imagen.

FAMILIAS TIPOGRÁFICAS A USAR:
- Display/Heading: Cormorant Garamond o Playfair Display (serifa clásica, para títulos heroicos)
- Body/UI: Montserrat o Inter (sans-serif geométrica, para interfaces y texto de lectura)
- Monospace: JetBrains Mono o Fira Code (solo para códigos de prendas, QR, datos técnicos ERP)

ESCALA TIPOGRÁFICA (mostrar cada nivel como texto en vivo + especificaciones):
- Display XL: 64px / 1.1 line-height / Cormorant Garamond Bold — "Elegancia que viste tu momento"
- Display L: 48px / 1.15 / Cormorant Garamond SemiBold
- H1: 36px / 1.2 / Montserrat Bold
- H2: 28px / 1.25 / Montserrat SemiBold
- H3: 22px / 1.3 / Montserrat SemiBold
- H4: 18px / 1.35 / Montserrat Medium
- Body L: 18px / 1.6 / Montserrat Regular
- Body M: 16px / 1.6 / Montserrat Regular (tamaño base)
- Body S: 14px / 1.5 / Montserrat Regular
- Caption: 12px / 1.4 / Montserrat Medium
- Overline: 11px / 1.2 / Montserrat Bold, tracking 0.15em, UPPERCASE
- Code: 13px / 1.5 / JetBrains Mono Regular

SECCIONES DE LA GUÍA:
1. Pairings: mostrar Display + Body en párrafo completo de ejemplo
2. Jerarquía en contexto: simular una tarjeta de producto de terno con todos los niveles
3. Uso en ERP: simular una fila de tabla (código de prenda, descripción, precio, estado)
4. Reglas tipográficas: 
   - ✓ Display solo para marketing/landing, nunca en formularios ERP
   - ✓ Overline para etiquetas de categoría ("NUEVA COLECCIÓN", "ALQUILER")
   - ✗ No combinar dos serifas
   - ✗ No usar peso Regular para botones (mínimo Medium)
5. Escala responsive: mostrar cómo reducen los tamaños en mobile (tabla breakpoints)

PALETA: navy #0A1628, gold #C8A24B, cream #F5F0E8
```
