# Sistema visual del ERP — segunda pasada

> **Qué es esto.** La spec del rediseño visual, de interacción y de movimiento de `apps/erp-web`.
> No reemplaza a [sistema-de-diseno.md](../../sistema-de-diseno.md): lo profundiza. Todo lo que ese
> documento dice sobre color, `toque`, `hover-fine` y movimiento reducido sigue vigente tal cual.
>
> **Fecha:** 6 de septiembre de 2026.
> **Estado:** aprobada en diseño. Sin implementar.
> **Alcance del rigor:** zona de presentación. No toca la cadena del sueldo, ni RLS, ni esquema de
> base. Ninguna regla de negocio cambia.

---

## 1. Por qué hay una segunda pasada

La pasada del 20 y 21 de agosto resolvió el color y el movimiento: tokens de marca en vez de la
paleta de Tailwind, una regla del guard que lo hace cumplir, ocho animaciones dentro de presupuesto,
área tocable de 44 px, movimiento reducido que quita el desplazamiento y conserva el color.

Lo que quedó sin resolver es todo lo demás. Hoy el sistema no tiene escala tipográfica, ni escala de
espaciado, ni jerarquía de superficies, ni escala de elevación, ni anillo de foco propio, ni
coreografía de entrada. Cada pantalla las improvisa. Se ve en el código de los componentes
compartidos, que son justamente los que deberían dar el ejemplo:

| Dónde | Qué hay | Qué revela |
|---|---|---|
| `card.tsx:25` | `text-lg font-semibold` | el título de tarjeta elige su tamaño a mano |
| `table.tsx:38` | `text-xs font-semibold uppercase tracking-wide text-muted` | la cabecera de tabla se escribe entera en cada uso |
| `stat-box.tsx:80` | `text-[10px] text-muted` | un tamaño arbitrario fuera de toda escala |
| `stat-box.tsx:88` | `focus-visible:ring-2 ring-gold/70 ring-offset-2` | el foco se define pieza por pieza |
| `empty-state.tsx:32` | `text-xs leading-relaxed` | tercer tamaño distinto para el mismo papel |

Cinco decisiones tomadas cinco veces. Multiplicado por 72 pantallas, eso es lo que hace que un
sistema con buenos colores se lea como una plantilla genérica.

El objetivo de esta pasada es cerrar esas escalas, darle al oro una gramática en vez de un adorno, y
convertir las 72 pantallas en cuatro arquetipos con plantilla.

---

## 2. Decisiones que enmarcan el trabajo

Tomadas con Alexander el 6 de septiembre de 2026.

| Decisión | Qué se eligió | Qué queda descartado |
|---|---|---|
| **Alcance** | Núcleo primero, propagación después | Rediseñar las 72 pantallas una por una |
| **Ambición** | Profundizar, no repintar | Volver a las serifas; lenguaje visual nuevo |
| **Maquetas** | Canvas navegable publicado | Prototipo dentro del ERP; sólo spec escrita |
| **Faro** | Panel, tablero, ficha, formulario operativo | Sumar evaluaciones y sueldos a la fase de maquetas |
| **Dispositivo** | Escritorio manda, teléfono se adapta | Teléfono primero; dos densidades conmutables |
| **Movimiento** | Expresivo con momentos destacados | Mínimo funcional |
| **Firma** | Hilo dorado, tipografía con voz, superficies con materia, crest presente | — |
| **Tokens** | Variables CSS como fuente única | Seguir espejando dos archivos a mano |

**Sobre «escritorio manda».** Se eligió a sabiendas de que la mitad del equipo llena el ERP de pie y
con el teléfono. La densidad y la jerarquía se calibran para escritorio, pero rige un **piso duro
que ninguna pantalla puede romper**:

1. Nada empuja la página de costado a 360 px.
2. Ningún control interactivo baja de 44 px de alto tocable.
3. Todo modal entra completo, con su pie alcanzable.
4. Ninguna tabla obliga a desplazamiento horizontal para leer el dato principal de una fila.

El punto 4 es el que exige la pieza nueva `TablaResponsive` (§7).

**Fuera de alcance, explícitamente.** Modo oscuro. Densidad conmutable. Extraer el sistema a un
paquete compartido con LB-Web. Las pantallas comerciales (`/caja`, `/pedidos`, `/clientes`,
`/finanzas`, `/estadisticas`, `/proveedores`, `/materiales`, `/compras`), que son código muerto según
`CLAUDE.md`. `/inventario` sí entra: sigue en uso.

---

## 3. Arquitectura de tokens

### 3.1 Fuente única

Hoy los tokens viven duplicados en `tailwind.config.ts` y en `:root` de `globals.css`, y el propio
documento lo confiesa: «los dos archivos se editan juntos, si no uno de los dos empieza a mentir».
Esta pasada multiplica la cantidad de tokens por cuatro, así que la duplicación deja de ser tolerable.

**Los tokens se definen una sola vez, en `globals.css`, como custom properties en canales RGB.**
`tailwind.config.ts` los consume:

```ts
// tailwind.config.ts
const t = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

colors: {
  navy:  { DEFAULT: t('--navy'), dark: t('--navy-dark'), deep: t('--navy-deep') },
  gold:  { DEFAULT: t('--gold'), soft: t('--gold-soft'), deep: t('--gold-deep') },
  paper: t('--paper'),
  superficie: { DEFAULT: t('--superficie'), hundida: t('--superficie-hundida') },
  // …
}
```

```css
/* globals.css */
:root {
  --navy: 46 62 110;        /* #2e3e6e */
  --gold: 184 165 21;       /* #b8a515 */
  /* … */
}
```

**Los nombres de clase no cambian.** `bg-navy`, `text-gold-deep`, `border-exito-line` siguen
funcionando igual, la regla `diseno` del guard sigue funcionando igual, y ninguna pantalla se toca.
Cambian exactamente dos archivos.

**El precio, que hay que conocer:** los canales RGB no se leen como un color. Cada token lleva el
hexadecimal en un comentario al lado, que es lo que ya hace el pipeline con sus tintes por columna.

### 3.2 Color: qué se agrega

Nada de lo que existe cambia de valor. Se suman dos superficies, que son la razón de que hoy todo se
lea plano — `paper` `#f6f4ef` y una tarjeta blanca son casi el mismo color:

| Token | Hex | Canales | Para qué |
|---|---|---|---|
| `superficie` | `#fffdf9` | `255 253 249` | La tarjeta. Blanco cálido, no blanco puro |
| `superficie-hundida` | `#efece4` | `239 236 228` | Lo que recibe algo: campo, celda de kanban, cebra de tabla |

La jerarquía completa queda en cuatro planos: `navy-deep` (shell) → `paper` (fondo de trabajo) →
`superficie` (tarjeta) → `superficie-hundida` (hueco dentro de la tarjeta).

### 3.3 Tipografía

Inter en los pesos que ya se cargan. Nueve tamaños con nombre semántico; **ningún componente vuelve
a elegir un tamaño de Tailwind**.

| Token | Tamaño / interlínea | Peso | Otros | Uso |
|---|---|---|---|---|
| `text-cifra` | 40 / 1 | 600 | `tabular-nums`, `tracking -.02em` | La cifra protagonista de un `StatBox` |
| `text-titulo` | 30 / 1.1 | 600 | `tracking -.015em` | `h1` de pantalla |
| `text-seccion` | 20 / 1.25 | 600 | `tracking -.01em` | `h2`, `CardTitle` |
| `text-sub` | 16 / 1.4 | 500 | — | `h3`, subtítulo de bloque |
| `text-cuerpo` | 14 / 1.55 | 400 | — | Texto normal, celda de texto |
| `text-dato` | 14 / 1.4 | 500 | `tabular-nums` | Celda numérica, monto en línea |
| `text-apoyo` | 13 / 1.45 | 400 | — | Subtítulo de cabecera, ayuda de campo |
| `text-rotulo` | 11 / 1.2 | 600 | `tracking .08em`, mayúsculas | Cabecera de tabla, `LabelGrupo`, sección de sidebar |
| `text-micro` | 11 / 1.3 | 500 | — | `Badge`, metadato, marca de tiempo |

**`text-rotulo` es la voz que falta.** Hoy una cabecera de tabla y la fecha de un metadato usan el
mismo `text-xs text-muted`, así que nada rotula nada y todo lo chico se lee igual de secundario. El
rótulo en versalitas espaciadas separa «esto nombra una columna» de «esto es un dato menor» sin
agregar un color más.

Se conserva sin cambios: **nada monoespaciado en el ERP** (guard vigente desde el 21-ago-2026). Las
cifras se alinean con `tabular-nums`, que ya viene dentro de `text-cifra` y `text-dato`.

### 3.4 Espaciado

Rejilla de 4. Cuatro tokens de ritmo vertical, para que dejen de convivir `mb-7`, `mb-6`, `mt-4` y
`gap-4` sin criterio:

| Token | px | Separa |
|---|---|---|
| `campo` | 12 | Dos campos dentro de un grupo |
| `bloque` | 20 | Dos bloques dentro de una tarjeta |
| `seccion` | 28 | Dos tarjetas, dos secciones |
| `pantalla` | 40 | La cabecera del contenido; el pie del contenido |

Relleno interno, fijo por pieza y no por pantalla: tarjeta `20`, celda de tabla `12 / 10`, campo
`12 / 10`, modal `24`.

### 3.5 Elevación

Cuatro niveles. **La sombra se deriva de `ink` (`32 40 63`), nunca es negra**: una sombra negra sobre
papel cálido se lee sucia.

| Token | Sombra | Cuándo |
|---|---|---|
| `elev-0` | ninguna, más borde de `line` | Tarjeta plana, contenedor de agrupación |
| `elev-1` | `0 1px 2px ink/4%`, `0 1px 3px ink/6%` | Tarjeta en reposo, barra de filtros despegada |
| `elev-2` | `0 2px 4px ink/5%`, `0 6px 12px ink/8%` | Tarjeta levantada al pasar, popover, menú |
| `elev-3` | `0 8px 16px ink/8%`, `0 24px 48px ink/12%` | Modal, drawer |

**Regla:** la elevación sube al interactuar y vuelve. Nunca es decorativa, nunca queda permanente
por encima de `elev-1`.

### 3.6 Radio

| Token | px | Para |
|---|---|---|
| `r-chico` | 6 | `Badge`, campo, botón chico, chip |
| `r-medio` | 10 | Tarjeta, botón, `StatBox` |
| `r-grande` | 16 | Modal, drawer, panel de página |

Hoy conviven `rounded-md`, `rounded-lg` y `rounded-xl` sin que la diferencia signifique nada.

### 3.7 Foco

**Un solo anillo en todo el sistema.** Se define una vez, como clase de componente:

```css
.anillo:focus-visible {
  outline: 2px solid rgb(var(--gold));
  outline-offset: 2px;
  border-radius: inherit;
}
```

Dorado, porque es el único acento que se lee tanto sobre `paper` como sobre el navy de la sidebar.
`outline` y no `box-shadow`: el `outline` no participa del layout, así que no puede empujar nada, y
sigue el radio del elemento.

Hoy el foco es el del navegador salvo en `stat-box.tsx`, que lo define a mano. Sobre navy,
directamente no se ve.

### 3.8 Movimiento

| Token | Valor | Para |
|---|---|---|
| `--dur-instante` | 90 ms | Presión sobre un control |
| `--dur-rapido` | 180 ms | Cruce esqueleto a contenido, aparición sin desplazamiento |
| `--dur-base` | 250 ms | Casi todo |
| `--dur-tope` | 300 ms | Máximo para interfaz repetitiva |
| `--dur-momento` | 450 ms | **Sólo los cuatro momentos de cierre** de §6 |
| `--escalon` | 40 ms | Retraso entre elementos de una entrada escalonada |
| `--curva-salida` | `cubic-bezier(.23, 1, .32, 1)` | Todo lo que entra o sale (ya existe) |
| `--curva-estado` | `cubic-bezier(.4, 0, .2, 1)` | Cambios bidireccionales: abrir y cerrar, activar y desactivar |

---

## 4. El hilo dorado como gramática

El oro deja de ser un adorno del título y pasa a ser **un mismo trazo que significa siempre lo
mismo: esto es lo que importa acá**.

| Pieza | Forma | Dónde |
|---|---|---|
| `hilo-titulo` | 2 px horizontal, tramo dorado de 2.5 rem sobre `line` | `PageHeader`. Es la `gold-rule` actual, sin cambios |
| `hilo-activo` | 3 px vertical a la izquierda | Ítem activo de sidebar, pestaña activa. **Reemplaza el fondo tintado** |
| `hilo-progreso` | 3 px horizontal, `scaleX` con `origin-left` sobre pista `line` | Toda barra de progreso del sistema |
| `hilo-fila` | 2 px vertical a la izquierda | Fila enfocada o seleccionada de una tabla |
| `hilo-cierre` | 2 px que se enhebra de izquierda a derecha | Los cuatro momentos de cierre de §6 |

**Por qué `hilo-activo` reemplaza al fondo tintado.** Un fondo dorado tenue detrás del ítem activo
compite con el fondo tintado que ya usan los estados semánticos, y a media opacidad sobre navy se
lee como suciedad. Un trazo no compite con nada y se lee igual de rápido.

### El crest

| Regla | Valor |
|---|---|
| Tamaño mínimo | 24 px de alto |
| Aire alrededor | Media altura del escudo, en los cuatro lados |
| Dónde aparece | Login · cabecera de todo documento imprimible · marca de agua al 4 % en `EmptyState` · cabecera de sidebar (ya está) |
| Dónde no | Dentro de una tarjeta de contenido, dentro de un modal, repetido en una lista |

La marca de agua del `EmptyState` es la que más cambia el carácter del sistema: hoy un hueco vacío
muestra un ícono gris de la librería y se lee como un error del navegador.

---

## 5. Los cuatro arquetipos

Toda pantalla del ERP es uno de estos cuatro. La plantilla define estructura, coreografía,
comportamiento a 360 px y los tres estados (carga, vacío, error).

### A · Panel

`/` · `/pipeline/metricas` · `/mi-desempeno` · `/estadisticas`

**Estructura.** Cabecera y su hilo → fila de `StatBox` → grilla de tarjetas.
Tiles: 4 columnas en escritorio, 2 en tablet, carrusel con anclaje a 360 px.
Grilla: 2 columnas en escritorio, 1 apilada bajo 900 px.

**Tipografía.** La cifra en `text-cifra`, el rótulo del tile en `text-rotulo`, el pie en
`text-apoyo`. El delta lleva flecha y color semántico, nunca sólo color.

**Estados.** Carga con `SkeletonStat` de la misma silueta.
**Un panel nunca está vacío**: muestra ceros y explica por qué están en cero («Todavía no hay
reportes de este período»), porque un panel en blanco se lee como una falla.

### B · Tablero denso

`/pipeline` · `/inventario` · `/administracion/reportes` · `/empleados` · `/solicitudes` ·
`/incidencias` · `/pagos` · `/colaboradores` · `/notificaciones`

**Estructura.** Cabecera y su hilo → barra de filtros pegajosa → tabla o kanban.
La barra de filtros gana `elev-1` sólo cuando se despega, para que se note que flota.
Muestra siempre el recuento de resultados y un modo de limpiar todo.

**Tabla.** Cabecera pegajosa en `text-rotulo`. Filas de 44 px. `hilo-fila` en la enfocada o
seleccionada. Cebra con `superficie-hundida` al 40 %. Columna de acciones a la derecha, fija en
escritorio. Celdas numéricas en `text-dato`, alineadas a la derecha.

**A 360 px la tabla no se desplaza de costado: se convierte en lista de tarjetas.** Dos datos
titulares arriba —el que identifica la fila y el que decide— y el resto como pares rótulo y valor.
El desplazamiento horizontal es la razón por la que hoy las tablas anchas son inservibles en el
teléfono: hay que arrastrar para leer, y al arrastrar se pierde de vista de quién era la fila.

**Errores.** `errorAccion` propio, arriba de todo y siempre visible, deja de ser un patrón de cinco
pantallas y pasa a ser requisito del arquetipo. Una acción disparada desde la lista no puede mostrar
su error dentro de un formulario que en ese momento está cerrado.

### C · Ficha

`/colaboradores/[id]` · `/pagos/[id]` · `/reportes/[id]` · `/solicitudes/[id]` · `/clientes/[id]` ·
`/personal/[id]` · `/pedidos/[id]`

**Estructura.** Cabecera de identidad —avatar, nombre, badges de estado, acciones primarias— sobre
`superficie` con `elev-1`. Debajo el hilo, y luego las pestañas con `hilo-activo`.
Contenido a 7/5 en escritorio; apilado bajo 900 px, con el panel derecho debajo.
**El panel derecho lleva metadatos y acciones secundarias, nunca contenido primario**: al apilarse
queda al final, y lo que quede ahí deja de leerse en el teléfono.

**La cabecera de identidad es la vista compartida.** Avatar y nombre persisten al navegar desde la
lista (§6).

**Errores.** `error.tsx` dentro del segmento de la pestaña, no arriba: si falla Pagos siguen en
pantalla la identidad, el período y las pestañas, y se puede pasar a Asistencias sin rehacer el
camino. Es lo que ya hace `/colaboradores/[id]`; se generaliza.

### D · Formulario operativo

`/reportes/nuevo` · `/envio-lavanderia` · `/pipeline/registrar` · `/valores` · `/evaluaciones` ·
`/sueldos/acuerdos` · `/solicitudes/nueva`

**Estructura.** Una columna, 640 px de ancho máximo, centrada. Cada grupo es una `Card` con su
`LabelGrupo` en `text-rotulo`. Pie pegajoso con la acción primaria.

**Reglas de entrada.** Todo conjunto cerrado va en `OpcionBotones`, no en un `<select>`; el
desplegable vuelve sólo cuando mostrar todas las opciones taparía el trabajo, y ahí lleva el
distintivo visual al lado del nombre. Las escalas distintas se separan en filas propias. Lo que ya
tiene valor se enciende en oro. Un «Otros» pide que lo describan.

**Pie.** Acción primaria, estado de guardado, y **el motivo de bloqueo visible también en el
teléfono** — el defecto de `hidden sm:inline` ya costó una vez, justo en el formulario del turno.

**Los tres formularios que hoy son modal migran a este arquetipo:** contrato de sueldo, nueva
solicitud y evaluar. La causa está escrita desde el 21-ago: un formulario que necesita desplazamiento
interno es un formulario que quería ser una página. El contrato va primero, porque lo que se pacta
ahí es lo que después se paga.

**Sólo los parámetros del contrato quedan en modal.** Es una decisión corta sobre un puñado de
números, no trabajo.

---

## 6. Movimiento

### El presupuesto

**250 ms base, 300 ms de tope** para todo lo que se repite. Una sola excepción, cerrada y
enumerada: **hasta 450 ms en los cuatro momentos de cierre**, que son los únicos lugares donde el
sistema tiene derecho a hacerse notar porque algo terminó y no tiene vuelta atrás:

1. Liquidación cerrada
2. Reporte de turno enviado
3. Prenda entregada
4. Evaluación firmada

En los cuatro, el movimiento es el mismo: `hilo-cierre` se enhebra de izquierda a derecha bajo el
título de lo que se cerró. Nada más del sistema usa `--dur-momento`.

### Coreografía de entrada

Escalón de 40 ms. Toda pantalla entra en el mismo orden, y ese orden es la jerarquía:

| Retraso | Qué entra |
|---|---|
| 0 ms | Cabecera y su hilo |
| 40 ms | Primer tile (cada siguiente, 40 ms más) |
| 160 ms | Contenido principal |
| 200 ms | Panel lateral |

Máximo 6 elementos escalonados. A partir del séptimo entran junto con el sexto: si no, la última
fila aparece medio segundo tarde y se lee como que la página se colgó.

### Movimiento nuevo

| Qué | Cómo | Por qué |
|---|---|---|
| **Presión** | Todo lo tocable baja a `scale(.985)` en 90 ms | Hoy sólo lo hace `Card interactive`. En una pantalla táctil sin `:hover`, es la única confirmación de que el toque llegó |
| **Cambio de valor** | `count-up` (la pieza ya existe) más un destello dorado de 400 ms sobre el fondo del tile | Una cifra que cambia sin avisar no se ve; la persona vuelve a mirar y ya cambió |
| **Prenda que avanza** | Sale por el borde derecho de su columna y entra por el izquierdo de la siguiente, 280 ms | La prenda no desaparece y reaparece: se mueve, que es lo que de verdad pasó |
| **Vista compartida** | Avatar y nombre persisten entre lista y ficha (View Transitions API) | Elimina el parpadeo de identidad al navegar |
| **Esqueleto a contenido** | Cruce de opacidad de 180 ms, sin desplazamiento | El esqueleto ya tiene la silueta correcta, así que no hace falta que nada salte |

**Reserva de la vista compartida.** Donde la View Transitions API no exista, el navegador ignora la
propiedad y la navegación queda como está hoy. No hay ruta condicional ni detección: es degradación
natural, y es la única forma de que no haya dos caminos de navegación que mantener.

### Lo que no cambia

Sólo `transform` y `opacity`. Hover con movimiento gateado con `hover-fine:`, hover de color sin
gatear. `prefers-reduced-motion` quita el desplazamiento y conserva color y opacidad a 120 ms.

---

## 7. Componentes

### Seis nuevos

| Pieza | Qué resuelve | Reemplaza a |
|---|---|---|
| `Superficie` | Fondo, elevación y radio en un solo lugar | `rounded-xl border border-line bg-white shadow-sm` repetido |
| `Rotulo` | El `text-rotulo` con su semántica | `text-xs font-semibold uppercase tracking-wide text-muted` repetido |
| `Cifra` | Número grande tabular, con `count-up`, destello al cambiar y formato de moneda o porcentaje | El `tabular-nums font-bold` de `StatBox` más el formateo suelto de cada pantalla |
| `TablaResponsive` | La tabla que a 360 px se vuelve lista de tarjetas | El `overflow-x-auto` de `Table`, que resuelve que no se rompa pero no que se lea |
| `BarraFiltros` | Barra pegajosa, elevación al despegarse, recuento de resultados, limpiar todo | Los filtros a mano de cada tablero |
| `PieAccion` | Pie pegajoso con acción primaria, estado de guardado y motivo de bloqueo | El bloque de botones al final de cada formulario |

**`TablaResponsive` es la pieza que desbloquea el piso móvil.** Recibe las columnas como datos —no
como JSX— con una marca de cuáles son las dos titulares, y decide por punto de corte si dibuja
`<table>` o lista de tarjetas. Sin esa forma, la transformación habría que escribirla pantalla por
pantalla y no se escribiría.

**`Cifra` no formatea sola.** El formato de moneda y de porcentaje sale de donde ya vive; `Cifra`
recibe el texto ya formateado más el valor numérico para animar. Duplicar el formateo en una pieza
de presentación es exactamente cómo se cuela una diferencia entre lo que se muestra y lo que se paga.

### Ocho afinados

| Pieza | Qué cambia |
|---|---|
| `Card` | Pasa a usar `Superficie`. `CardTitle` a `text-seccion` |
| `StatBox` | Usa `Cifra` y `Rotulo`. Foco por `anillo`. Se va el `text-[10px]` |
| `Table` | Cabecera en `text-rotulo` y pegajosa, `hilo-fila`, cebra, celdas numéricas en `text-dato` |
| `Button` | Presión de 90 ms, `anillo`, tamaño `grande` de 44 px para lo que se llena de pie |
| `Badge` | `text-micro`, `r-chico` |
| `EmptyState` | Crest de agua al 4 %, título en `text-sub`, cuerpo en `text-apoyo` |
| `PageHeader` | Coreografía de entrada, ranura de migas, subtítulo en `text-apoyo` |
| `Modal` | `elev-3`, `r-grande`, entrada de 240 ms. Los dos defectos de foco y de alto ya están cerrados |

### Lo que no se agrega

Pestañas, migas, línea de tiempo, cajón lateral, paginación y avisos flotantes **no** entran en esta
pasada. Cada uno se resuelve hoy a mano en una o dos pantallas, y una pieza compartida sin al menos
tres consumidores reales es código muerto documentado — que es peor que código muerto a secas. Ya
pasó con `Field`, que se creó y se borró el mismo día por no tener ni un solo uso.

---

## 8. Escritura

Se conserva lo escrito en `sistema-de-diseno.md` §7 y se suma una regla que sale de esta pasada:

**Un rótulo nombra; un metadato acompaña.** Si el texto chico dice de qué es lo que está al lado, es
`Rotulo`. Si dice algo sobre lo que está al lado —cuándo, quién, cuántos—, es `text-micro` o
`text-apoyo`. Hoy los dos se escriben igual y por eso ninguno de los dos se lee.

---

## 9. El guard

Cinco reglas nuevas en `tools/guard-reglas.sh`, todas sobre `apps/erp-web`:

| Regla | Prohíbe | Obliga a |
|---|---|---|
| `tipografia` | `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, y los tamaños arbitrarios entre corchetes | Los nueve tokens con nombre |
| `radio` | `rounded-` seguido de cualquier cosa que no sean los tres radios | `r-chico`, `r-medio`, `r-grande` |
| `elevacion` | `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl` | `elev-0` a `elev-3` |
| `foco` | `focus-visible:ring-`, `focus:ring-`, y `outline-none` sin `anillo` en la misma cadena de clases | `anillo` |
| `carga` | Una ruta con `page.tsx` que consulta datos y no tiene `loading.tsx` hermano | Un `loading.tsx` por ruta |

**Las cinco van con línea base congelada.** Hoy fallan en decenas de archivos: las 72 pantallas
usan `text-sm` y `rounded-lg` en todas partes. Sin línea base el guard queda en rojo permanente y
alguien lo apaga, y entonces no protege nada. Con línea base, la violación conocida se tolera, **no
puede crecer**, y cada pantalla propagada se descuenta de la lista — que es el mismo mecanismo con
el que ya está contada la deuda de estilo en línea.

**Al escribir las reglas, la trampa que ya costó una vez:** no usar la secuencia de borde de palabra
de las expresiones regulares. Escrita desde un script, esa secuencia se convirtió en un carácter de
retroceso, el patrón dejó de coincidir con nada y la regla pasó en verde sin mirar un solo archivo.
Se exige en su lugar que el carácter anterior no sea una letra, y **se prueba en las dos
direcciones**: con una violación inyectada tiene que fallar con código 1, y sin ella tiene que pasar.

---

## 10. Orden de trabajo

| Fase | Qué | Cómo se da por buena |
|---|---|---|
| **0** | Canvas navegable con los cuatro arquetipos, el catálogo de componentes y las escalas | Alexander lo mira y aprueba o corrige |
| **1** | Tokens: `globals.css` como fuente única, `tailwind.config.ts` derivado, familias nuevas | Las utilidades de token existentes siguen presentes en el CSS compilado, una por una |
| **2** | `anillo`, `elev-*`, `hilo-*` y las clases de componente en `globals.css` | `next build` y comprobación de presencia en el CSS compilado |
| **3** | Seis componentes nuevos | Typecheck, `next build`, y **cada uno con al menos un consumidor real en la misma tanda** |
| **4** | Ocho componentes afinados | Typecheck, `next build`, guard, y revisión en pantalla de las cuatro faro |
| **5** | Shell: sidebar, topbar, `PageHeader`, navegación móvil | Revisión en pantalla a 360 px y a 1440 px |
| **6** | Las cuatro pantallas faro | Revisión en pantalla, incluyendo carga, vacío y error |
| **7** | Reglas del guard con línea base congelada | La regla falla con violación inyectada y pasa sin ella |
| **8** | Propagación al alcance vivo, pantalla por pantalla | Checklist de §11 por pantalla, y la línea base baja en cada una |

**Regla del repo que aplica acá:** spec y código nunca en el mismo commit. Este documento se
commitea solo, antes de que se escriba una línea de la fase 1.

---

## 11. Checklist de propagación

Una por pantalla, en la fase 8:

1. ¿Qué arquetipo es? Se aplica su plantilla completa, no partes.
2. Ningún tamaño de texto fuera de los nueve tokens.
3. Ningún radio, sombra ni anillo fuera de los tokens.
4. Espaciado vertical sólo con los cuatro tokens de ritmo.
5. A 360 px: nada empuja de costado, nada tocable baja de 44 px, las tablas se leen.
6. Los tres estados existen y dicen algo: carga con la silueta correcta, vacío que dice de dónde
   sale lo que falta, error que dice qué pasó y qué hacer.
7. Todo control deshabilitado dice por qué, y lo dice también en el teléfono.
8. Todo conjunto cerrado de opciones está en botones, salvo que no quepa.
9. La pantalla sale de la línea base del guard.

---

## 12. Riesgos

| Riesgo | Cómo se contiene |
|---|---|
| **Nadie mira una pantalla renderizada**, que es la limitación que ya pesó en la pasada de agosto | El canvas de la fase 0 es lo primero, y las fases 4 a 6 exigen revisión en pantalla como criterio de cierre |
| La conversión de hexadecimal a canales RGB rompe un color en silencio | Comprobar las utilidades de token una por una en el CSS compilado, como se hizo con las 105 del 20-ago |
| El guard nuevo queda en rojo y alguien lo apaga | Línea base congelada desde el primer commit de la fase 7 |
| Seis componentes nuevos sin consumidores reales | Cada uno entra con al menos un consumidor en la misma tanda, o no entra |
| Los momentos de 450 ms se propagan | Están enumerados: cuatro, y `--dur-momento` no se usa en ningún otro lugar. Es revisable con una búsqueda |
| «Escritorio manda» empeora la adopción, que ya está en 4,4 % | El piso móvil de §2 es duro y está en la checklist como punto 5 |
| La vista compartida no existe en algún navegador del equipo | Degrada sola. No hay ruta condicional que mantener |

---

## 13. Lo que esta spec no resuelve

- **No hay tests de interfaz, y sigue sin haberlos.** La red es `next build`, el typecheck y el
  guard; ninguno de los tres se entera de que una clase inventada no pinta nada. La comprobación de
  presencia en el CSS compilado sigue siendo el sustituto.
- **Modo oscuro.** La arquitectura de la fase 1 lo deja a un bloque de variables de distancia, pero
  no entra.
- **Densidad conmutable.** Mismo caso.
- **Las pantallas comerciales.** Código muerto: quedan como están, con sus `window.alert()` y sus
  `window.confirm()` sin convertir.
