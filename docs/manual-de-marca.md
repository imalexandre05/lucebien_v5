# Manual de Marca — LuceBien
**Versión 1.0 · Mayo 2026**

---

## 1. Esencia de Marca

### ¿Quiénes somos?
LuceBien es el referente en alquiler y confección de trajes formales en Arequipa. Llevamos décadas vistiendo a hombres en sus momentos más importantes: bodas, graduaciones, quinceañeras, eventos corporativos.

### Tagline
> **"Para la Ocasión"**

Este tagline no es decorativo. Define nuestra propuesta de valor: el cliente no nos compra ropa, nos compra el hecho de **verse bien en el momento que más importa**.

### Pilares de personalidad

| Pilar | Qué significa en LuceBien |
|---|---|
| **Elegancia accesible** | El lujo no es exclusivo. Todos merecen verse bien. |
| **Confianza artesanal** | Décadas de oficio. Manos que conocen la tela. |
| **Precisión** | Cada prenda, en su talla, a tiempo, en perfecto estado. |
| **Orgullo local** | Arequipa. Perú. No imitamos marcas extranjeras. |

---

## 2. El Logo

### Anatomía del logo completo

El logo tiene tres elementos que deben entenderse como sistema:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   [SELLO DEL LEÓN]     LUCEBIEN                     │
│                        Para la Ocasión              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**a) El Sello del León (Isotipo)**
- Un león geométrico con corbatín, enmarcado por un borde en zigzag.
- El borde en zigzag NO es decorativo: representa el **corte de tijera dentada** (pinking shears) de la sastrería. Es el motivo gráfico más poderoso de la marca.
- El monograma **"LB"** aparece dentro del sello, abajo a la derecha.
- El conjunto evoca un **timbre postal o sello de garantía** — comunicando autenticidad y tradición.

**b) El Wordmark (Logotipo)**
- **"LUCE"** en peso fino — elegancia, ligereza.
- **"BIEN"** en peso ultra-bold — contundencia, confianza.
- El contraste fino/bold es intencional: es el mismo recurso de las portadas de revistas de moda (*Vogue*, *GQ*).
- Fuente: serif de alto contraste (estilo Didot/Bodoni). **No reemplazar por otra tipografía.**

**c) El Tagline**
- "Para la Ocasión" en sans-serif ligero, centrado bajo el wordmark.
- Siempre en caja baja con mayúscula inicial.

---

## 3. Variantes del Logo

Tenemos archivos para cada contexto. Usar siempre el correcto:

| Archivo | Cuándo usar |
|---|---|
| `logo_full_color.png` | Uso principal. Fondos blancos o crema. |
| `logo_full_black.png` | Documentos impresos, facturas, sobres. |
| `logo_full_white.png` | Fondos oscuros (navy, negro). ERP interno. |
| `logo_lion_color.png` | Ícono de app, favicon, insignias, bordados. |
| `logo_lion_black.png` | Sellos, estampados monocromáticos. |
| `logo_lion_white.png` | Fondos oscuros cuando solo se necesita el ícono. |
| `logo_lion_bw.png` | Fotocopias, documentos b/n. |
| `logo_text_black.png` | Cuando el espacio es horizontal y el ícono no cabe. |
| `logo_text_white.png` | Versión horizontal sobre fondos oscuros. |

### Versión recomendada por superficie

```
Web e-commerce (fondo claro)  → logo_full_color.png
ERP interno (fondo navy)      → logo_full_white.png
Favicon / App icon            → logo_lion_color.png
Etiquetas de prenda           → logo_lion_black.png
Bolsas / Packaging            → logo_full_black.png
```

---

## 4. Zona de Exclusión

Alrededor del sello del león, mantener un espacio libre equivalente a **la altura de la letra "L"** del wordmark en todos sus lados. Nadie más entra en ese espacio.

```
    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
    ▓                  ▓
    ▓   [  LOGO  ]     ▓
    ▓                  ▓
    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

---

## 5. Usos Incorrectos

Nunca:
- Cambiar la proporción del logo (estirarlo o aplastarlo)
- Separar el sello del wordmark en el logo completo
- Usar el wordmark sobre fondos de color que no sean blanco, crema, navy o negro
- Rotar el logo
- Aplicar sombras, resplandores o efectos 3D
- Cambiar la tipografía del wordmark
- Usar el logo sobre fotografías con poco contraste
- Cambiar el color del oro por otro amarillo o naranja

---

## 6. Paleta Cromática

### Colores primarios

| Nombre | Hex | Uso |
|---|---|---|
| **Navy** | `#2e3e6e` | Color institucional principal. Fondos ERP, headers. |
| **Navy Oscuro** | `#1e2a4a` | Superficies elevadas en ERP, sombras navy. |
| **Navy Profundo** | `#141c33` | Fondo oscuro máximo. |
| **Gold** | `#b8a515` | Acentos, CTAs, elementos destacados. |
| **Gold Claro** | `#d4bf1e` | Hover states, variante más luminosa. |
| **Gold Oscuro** | `#8a7c10` | Textos dorados, versiones impresas. |

### Colores neutros (web e-commerce — light mode)

| Nombre | Hex | Uso |
|---|---|---|
| **Blanco Cálido** | `#f8f7f4` | Fondo principal web. No usar blanco puro `#fff`. |
| **Crema** | `#f0ede6` | Fondo de cards, secciones alternadas. |
| **Gris Texto** | `#1a1a1a` | Texto principal (no negro puro). |
| **Gris Suave** | `#6b7280` | Texto secundario, subtítulos. |
| **Gris Borde** | `rgba(46,62,110,.10)` | Bordes de cards en modo claro. |

### Colores semánticos

| Nombre | Hex | Uso |
|---|---|---|
| **Éxito** | `#2d9e6b` | Confirmaciones, disponibilidad. |
| **Advertencia** | `#e08c1a` | Alertas no críticas. |
| **Error** | `#c94040` | Errores, stock agotado. |
| **Info** | `#3a7fc1` | Información neutral. |

> **En el ERP estos cuatro son tokens, no hexadecimales sueltos.** Cada familia tiene cuatro pasos
> —`soft` para el fondo, `line` para el borde, la base para el punto o la barra, `deep` para el
> texto— y el paso `deep` sobre `soft` pasa 4.5:1 en las cuatro. Ver
> [sistema-de-diseno.md](sistema-de-diseno.md) §2.
>
> La paleta por defecto de Tailwind no se usa: sus verdes y ámbares son fríos al lado del navy y
> del oro.

### Cómo usar el oro

El dorado es un color **de acento, no de fondo**. Reglas:
- Botones primarios: fondo navy, texto blanco. El borde o el hover puede ser gold.
- Líneas decorativas, separadores: gold.
- Precio destacado: gold oscuro (`#8a7c10`) sobre fondo claro para garantizar legibilidad.
- Nunca: texto gold sobre fondo blanco (contraste insuficiente para lectura larga).

---

## 7. Tipografía

### Sistema tipográfico

| Rol | Fuente | Uso |
|---|---|---|
| **Display / Marca** | Cormorant Garamond | Solo logo, títulos hero en e-commerce, precio de prenda destacado |
| **Cuerpo / UI** | Inter | Todo el texto de interfaz, párrafos, botones, labels |
| **Datos / Técnico** | JetBrains Mono | Códigos de prenda y precios **en pieza impresa**. Ver la nota de abajo |

### Escala tipográfica

```
4xl  → 2.25rem  → Títulos hero (e-commerce, portada)
3xl  → 1.875rem → H1 de sección
2xl  → 1.5rem   → H2, títulos de card
xl   → 1.25rem  → H3, precios destacados
lg   → 1.125rem → Subtítulos
base → 1rem     → Texto cuerpo
sm   → 0.875rem → UI densa, labels (ERP)
xs   → 0.75rem  → Badges, notas, metadatos
```

### Pesos permitidos para Inter

- **700 (Bold):** Títulos, precios, CTAs
- **600 (Semibold):** Subtítulos, labels importantes
- **400 (Regular):** Texto cuerpo, párrafos
- **300 (Light):** Taglines, textos decorativos

---

## 8. El Motivo del Zigzag (Pinking Shear)

El borde en zigzag del sello es el motivo gráfico más diferenciador de LuceBien. **Hay que explotarlo.**

### Cómo usarlo

- **Separadores de sección** en la web: una línea zigzag fina gold entre bloques.
- **Bordes decorativos** en cards de productos o etiquetas.
- **Textura de fondo** (muy sutil, 3-5% de opacidad) en secciones especiales.
- **Etiquetas físicas** de las prendas: el corte de la etiqueta puede ser zigzag.
- **Packaging**: bordes de bolsas o cajas.

### Cómo NO usarlo

- No como fondo dominante (se vuelve ruido visual).
- No en todos lados al mismo tiempo (pierde impacto).

---

## 9. Iconografía

Usar **Lucide Icons** o **Phosphor Icons** — trazos simples, no rellenos, peso consistente de 1.5px. Son compatibles con el estilo limpio y editorial de la marca.

No usar:
- Emojis como elementos de interfaz (solo funcionales en el ERP interno donde ya existen)
- Iconos con estilo "cartoon" o "flat colorido"
- Mezclar familias de iconos distintas en la misma pantalla

---

## 10. Tono y Voz

### Cómo habla LuceBien

| Contexto | Tono | Ejemplo |
|---|---|---|
| **Web / cliente** | Elegante, cálido, aspiracional | "Luce impecable en tu gran día." |
| **ERP / operarios** | Directo, claro, sin adornos | "Prenda enviada a tienda LuceBien." |
| **Errores web** | Amable, nunca técnico | "No encontramos ese producto. ¿Buscas algo más?" |
| **Confirmaciones** | Afirmativo, preciso | "Reserva confirmada para el 15 de junio." |

### Reglas de escritura

- Nombre de la empresa: siempre **LuceBien** (una palabra, L y B mayúsculas).
- Tagline: siempre **"Para la Ocasión"** (con tilde, con mayúscula inicial).
- No usar: "tux", "smoking" (anglicismos); preferir "terno", "saco", "pantalón de vestir".
- Precios: siempre con símbolo sol **S/** antes del número. Ej: `S/ 120`.

---

## 11. Aplicaciones de la Marca

### Web E-commerce (modo claro)
- Fondo: `#f8f7f4` (blanco cálido)
- Logo: `logo_full_color.png` en el header
- Favicon: `logo_lion_color.png` recortado al cuadrado del sello
- Botón CTA principal: fondo `#2e3e6e` (navy), texto blanco, hover con borde gold
- Precio: `JetBrains Mono`, bold, `#1a1a1a`; precio tachado en `#6b7280`

### ERP Interno (modo oscuro navy)
- Fondo: `#141c33` → `#1a2540`
- Logo: `logo_full_white.png` en sidebar
- Acentos: gold para estados activos, selecciones, CTAs

### Etiquetas de prenda
- Logo: `logo_lion_black.png`
- Código de prenda: `JetBrains Mono`, bold
- Borde de la etiqueta: corte zigzag (pinking shear)

### Redes Sociales
- Foto de perfil: `logo_lion_color.png` sobre fondo gold `#b8a515`
- Portada: wordmark `logo_text_black.png` centrado sobre fondo `#f8f7f4` o navy

---

## 12. Archivos Disponibles

Todos los archivos están en `public/assets/`:

```
logo_full_color.png    → Logo completo (ícono + texto) a color
logo_full_black.png    → Logo completo en negro
logo_full_white.png    → Logo completo en blanco
logo_lion_color.png    → Solo el sello del león a color
logo_lion_black.png    → Sello del león en negro
logo_lion_white.png    → Sello del león en blanco
logo_lion_bw.png       → Sello del león en escala de grises
logo_text_black.png    → Solo wordmark "LUCEBIEN · Para la Ocasión" en negro
logo_text_white.png    → Solo wordmark en blanco
```

**Pendiente:** Exportar versiones `.svg` de todos los logos para uso web (los PNG son para impresión y uso donde no se puede SVG).

---

_Manual preparado en base a los activos existentes de la marca. Actualizar cuando se agreguen nuevos activos o se tomen decisiones sobre el e-commerce._
