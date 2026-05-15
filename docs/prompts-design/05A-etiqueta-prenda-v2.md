# Prompt 5A v2 — Etiqueta de Prenda LUCEBIEN (sistema completo)

> Reemplaza al 5A anterior. Incorpora el sistema operativo real de la empresa.

---

```
Rediseña la etiqueta física de LUCEBIEN / CASA DE LOS TERNOS con el sistema
operativo real de la empresa. Corrige también los errores de posición del
diseño anterior.

════════════════════════════════════════════════════════
CONTEXTO OPERATIVO — leer antes de diseñar
════════════════════════════════════════════════════════

EMPRESA: Alquiler, venta y confección de ternos formales masculinos.
3 tiendas en Huancayo, Perú (Lucebien Real 380 | Stand 101-102 Real 326 |
Trece). Almacén Central como lavandería y bodega.

PRINCIPIO CLAVE: La etiqueta se imprime UNA SOLA VEZ por prenda y nunca
se reimprime. Todo lo que cambia (estado, ubicación, disponibilidad) vive
en el sistema SCI-LB. La etiqueta física es solo la "llave" de acceso.

SISTEMA DE CÓDIGOS REAL:
  TN-042   → Terno completo #42
  BL-015   → Blazer #15
  SK-008   → Saco solo #8
  PT-033   → Pantalón solo #33
  CM-008   → Camisa (código de LOTE, no individual)
  CB-015   → Corbata (código de LOTE)
  MÑ-007   → Moño / bow tie (código de LOTE)
  CT-003   → Corbatón (código de LOTE)
  PÑ-012   → Pañuelo de bolsillo (código de LOTE)
  CR-004   → Correa (individual)
  ZP-011   → Zapatos / par (individual)

Formato: [TIPO]-[NNN] — sin ceros de relleno innecesarios, máximo 3 dígitos.
El código NO incluye la tienda de origen — esa info vive en SCI-LB.

TIPOS DE TRACKEO:
- Individual: TN, BL, SK, PT, CR, ZP — cada prenda tiene su propio código
- Por lote: CM, CB, MÑ, CT, PÑ — se trackea cantidad del grupo, no pieza individual
  (son prendas lavables de alta rotación)

INDICADOR ALQUILER / VENTA:
La mayoría de prendas están disponibles para ALQUILER Y VENTA (default, sin marcador).
EXCEPCIÓN: prendas solo venta llevan un pequeño punto adhesivo rojo pegado manualmente.
NO imprimir variante de etiqueta distinta para esto — el punto de color va sobre la etiqueta.

QR Y CÓDIGO DE BARRAS:
- Barcode Code 128 en la parte inferior → SCI-LB interno (escáner de mano en tienda/almacén)
- QR code → enlaza a lucebien.com/p/TN-042 (página pública de la prenda en el e-commerce):
    · Foto de la prenda
    · Disponibilidad en tiempo real
    · Precio de alquiler y venta
    · Sedes donde está disponible
    · Botón "Reservar"
El cliente puede escanear el QR del terno que le gustó en tienda y reservarlo desde su celular.

════════════════════════════════════════════════════════
TOKENS REALES DEL SISTEMA (usar exactamente estos)
════════════════════════════════════════════════════════

Navy:      #2e3e6e  |  Navy dark: #1e2a4a  |  Navy deep: #141c33
Gold:      #b8a515  |  Gold light: #d4bf1e
Cream/bg:  #f8f7f4  |  Blanco: #ffffff
Tipografía display: Cormorant Garamond (títulos, nombre de prenda)
Tipografía UI:      Inter (datos operativos, instrucciones)
Tipografía mono:    JetBrains Mono (código de prenda, barcode text)
Motivo zigzag: línea de dientes de sierra en gold #b8a515 (pinking shear)
Logos disponibles: logo_full_color.png, logo_text_black.png, logo_lion_bw.png

════════════════════════════════════════════════════════
FORMATO FÍSICO
════════════════════════════════════════════════════════

Tamaño:   6 cm × 10 cm
Material: Cartulina premium mate (prendas de valor) o kraft (ingreso a almacén)
Impresión base: 2 colores en imprenta (navy + gold) — plantilla fija sin datos
Datos variables: impresos on-demand con impresora térmica (Zebra / Brother)
Enganche: orificio redondo en esquina superior, hilo encerado natural 18 cm,
          nudo cuadrado al ojal de la solapa o botón superior del saco

════════════════════════════════════════════════════════
ESTRUCTURA DE LA ETIQUETA — 7 zonas (mantener en diseño)
════════════════════════════════════════════════════════

CARA FRONTAL (de arriba a abajo):
  [1] LOGO — logo_full_color.png o logo_text_black.png, parte superior
  [2] ZIGZAG — línea decorativa gold debajo del logo
  [3] CÓDIGO — JetBrains Mono grande y legible: "TN-042"
  [4] DESCRIPCIÓN — Inter Regular pequeño: "Terno Clásico · Navy · Talla M"
  [5] QR — código QR centrado, tamaño mínimo escaneable
       Texto debajo: "ESCANEA PARA VER HISTORIAL Y ESTADO"
  [6] PRECIO POR DÍA — alineado a la derecha inferior: "S/ 120"
  [7] BARCODE — Code 128 en la parte más baja, con texto del código debajo

CARA POSTERIOR:
  PROCESO DE ALQUILER — 4 pasos con íconos minimal:
    01 Elige tu terno
    02 Reserva tu fecha
    03 Recoge en tienda
    04 Devuelve limpio
  lucebien.com
  "Cuida la prenda — devuélvela en las mismas condiciones"
  Footer: sede actual de la prenda (ej. "Casa de los Ternos · Huancayo")

════════════════════════════════════════════════════════
VARIANTES A DISEÑAR (un artboard por variante)
════════════════════════════════════════════════════════

VARIANTE 01 — Etiqueta estándar (alquiler y venta)
  Cartulina blanca premium mate. Sin marcador especial.
  Cara frontal y posterior como se describió arriba.
  Mostrar: frontal + posterior como cartas separadas.

VARIANTE 02 — Etiqueta solo venta
  Igual a V01 pero con punto adhesivo rojo en esquina superior izquierda.
  Nota aclaratoria en el artboard: "El punto rojo es un sticker adhesivo
  aplicado manualmente — no está impreso en la etiqueta."

VARIANTE 03 — Etiqueta de ingreso a almacén
  Material: cartulina kraft (diferencia visual inmediata).
  Sin precio (aún no está en sistema).
  Cara posterior: RUTA OPERATIVA en lugar del proceso de alquiler:
    01 Recepción — QC inicial
    02 Lavado / tintorería
    03 Empatado — codificación
    04 Stock — listo p/ envío
  Footer: "Almacén Central · sci-lb operaciones"
  Nota: "Interna — no entregar al cliente"

VARIANTE 04 — Etiqueta de lote (para lavables: camisas, corbatas, moños)
  Tamaño reducido: 4 cm × 6 cm
  Solo cara frontal (sin reverso — van cosidas o atadas)
  Campos: código de lote (ej. CB-015), descripción breve, QR, barcode
  Sin precio individual — el precio del lote está en SCI-LB
  Nota de uso: "Esta etiqueta representa un LOTE de unidades del mismo tipo.
  El cliente recibe una unidad del lote, no esta pieza específica."
  Mostrar tres ejemplos: CB-015 (Corbata), MÑ-007 (Moño), CM-008 (Camisa)

════════════════════════════════════════════════════════
SECCIÓN ADICIONAL — Sistema offline de precios
════════════════════════════════════════════════════════

Diseñar también (mismo archivo, nueva sección):

TARJETA LAMINADA DE PRECIOS DE EMERGENCIA
  Formato: A6 (105 × 148 mm), diseñada para plastificar y colgar en tienda
  Fondo cream #f8f7f4, encabezado navy
  Contenido:
    LUCEBIEN — Precios de Alquiler por Día
    Vigente desde: [fecha]
    ─────────────────────────
    Terno completo  S/ 120 – 180
    Blazer          S/ 70 – 100
    Saco solo       S/ 50 – 80
    Pantalón solo   S/ 30 – 50
    Camisa          S/ 25
    Corbata         S/ 15
    Moño            S/ 15
    Zapatos (par)   S/ 30
    ─────────────────────────
    Precios de venta: consultar en sistema o al asesor
  Footer: "Usar solo cuando el sistema esté offline"
  Nota en el artboard: "Se imprime y plastifica en tienda cuando cambian precios"

════════════════════════════════════════════════════════
SECCIÓN FINAL — Contexto de uso físico
════════════════════════════════════════════════════════

Mostrar una escena final (mockup realista):
  - Saco navy colgado en percha de tienda
  - Etiqueta V01 colgando del ojal de la solapa con hilo encerado
  - Etiqueta a la altura de la mano del cliente
  - QR visible y escaneable desde esa posición
  Copy: "Una etiqueta es una promesa."
  Subcopy: "Cuando el cliente ve esta etiqueta colgando, sabe que el terno
  está codificado, registrado, y listo. La marca trabaja antes de que él
  diga una palabra."

Footer del documento:
SISTEMA DE DISEÑO · MATERIALES FÍSICOS · ETIQUETA DE PRENDA · V2.0
```
