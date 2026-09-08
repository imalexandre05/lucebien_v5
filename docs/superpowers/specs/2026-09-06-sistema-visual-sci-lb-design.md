# Sistema visual del ERP — segunda pasada

> **Qué es esto.** La spec del rediseño visual, de interacción y de movimiento de `apps/erp-web`.
> No reemplaza a [sistema-de-diseno.md](../../sistema-de-diseno.md): lo profundiza. Todo lo que ese
> documento dice sobre color, `toque`, `hover-fine` y movimiento reducido sigue vigente tal cual.
>
> **Fecha:** 6 de septiembre de 2026.
> **Revisión 2, el mismo día:** tras ver las primeras maquetas, Alexander pidió más vida, más color
> y más movimiento. Cambiaron §3.3 (acento por módulo), §3.9 y §6 (tres presupuestos de
> movimiento), §4 (el hilo pasa a dos tramos) y §7 (capa de visualización de datos).
>
> **Revisión 3, el mismo día — «modo vibrante».** Alexander pidió ir más lejos: menos corporativo,
> más amigable, más colorido y más movido. Esto **revierte dos decisiones anteriores y hay que
> saberlo**: la estética «seria y sobria» del manual de marca §3, y la tipografía única de la Fase 4
> («sin serifas en el sistema», Inter para todo). Lo que no se toca: la paleta sigue siendo la de
> LuceBien, y los siete no-negociables del repo siguen intactos. Cambian §3.4 (Outfit como display),
> §3.6 (sombra teñida), §3.7 (radios generosos y pastilla), §3.9 (presupuestos más largos y curva
> con rebote), la nueva §3.10 (banda de módulo) y §7 (dos piezas más).
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
| **Color** | Acento por módulo, sobre familia categórica ampliada a siete | Color sólo dentro de los datos; repintado completo |
| **Animación** | Tres presupuestos, treinta y seis piezas enumeradas | Máximo movimiento; mantener el tope único de 300 ms |
| **Carácter** | Modo vibrante: banda de módulo en color pleno, radios generosos, sombra teñida, display propio | La sobriedad corporativa del manual §3 |
| **Superficies** | Dos: operario sin teclado y administración densa (§3.11) | Una sola interfaz para los dos públicos |

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

### 3.2 Color: superficies

Nada de lo que existe cambia de valor. Se suman dos superficies, que son la razón de que hoy todo se
lea plano — `paper` `#f6f4ef` y una tarjeta blanca son casi el mismo color:

| Token | Hex | Canales | Para qué |
|---|---|---|---|
| `superficie` | `#fffdf9` | `255 253 249` | La tarjeta. Blanco cálido, no blanco puro |
| `superficie-hundida` | `#efece4` | `239 236 228` | Lo que recibe algo: campo, celda de kanban, cebra de tabla |

La jerarquía completa queda en cuatro planos: `navy-deep` (shell) → `paper` (fondo de trabajo) →
`superficie` (tarjeta) → `superficie-hundida` (hueco dentro de la tarjeta).

### 3.3 Color: el acento por módulo

El sistema tiene hoy tres familias categóricas —lila, arcilla y mar— usadas casi sólo en los chips de
rol. Se amplían a **siete**, y con navy y `gold-deep` completan **nueve acentos**: uno por cada tipo
de trabajo que hace el ERP.

**El acento no es decoración: es orientación.** Dice de qué clase de trabajo es la pantalla antes de
que se lea el título, y lo dice igual en el menú, en la cabecera, en los tiles y en los gráficos.

| Familia | `soft` | `line` | *(base)* | `deep` | Tono |
|---|---|---|---|---|---|
| `cat-mar` | `#e8f3f4` | `#c0dee1` | `#2f7f88` | `#1e5a61` | 187° verde azulado *(existente)* |
| `cat-lila` | `#f2eef9` | `#d7cbee` | `#6f5aa8` | `#4e3d7d` | 265° violeta *(existente)* |
| `cat-arcilla` | `#fbeee9` | `#f0cfc1` | `#b5643f` | `#8a462a` | 18° terracota *(existente)* |
| `cat-oliva` | `#f1f4e7` | `#d5deb9` | `#6d8438` | `#4b5c23` | 82° verde oliva **nuevo** |
| `cat-ciruela` | `#f7edf7` | `#e3c9e4` | `#8f4f92` | `#67356a` | 297° ciruela **nuevo** |
| `cat-humo` | `#eef1f4` | `#ccd5de` | `#5b7086` | `#3c4d5e` | 210° azul grisáceo frío **nuevo** |
| `cat-piedra` | `#f4f1eb` | `#ded6c8` | `#8a7a63` | `#5d5140` | 40° gris cálido **nuevo** |

`deep` sobre `soft` pasa 4.5:1 en las siete. **La base no es para texto largo**: es superficie, punto
de gráfico y trazo.

**Por qué siete y no doce.** El espacio de tono utilizable es más chico de lo que parece: el oro
ocupa los 54°, el aviso los 35°, el error los 0°, el éxito los 155°, el info los 207° y el navy los
226°. Un categórico que caiga encima de cualquiera de ésos enseña a leer mal el sistema entero — es
el mismo error que ya se cometió pintando los chips de rol con el verde de éxito, porque **un
encargado no es un acierto**. Las cuatro familias nuevas se eligieron por hueco libre, no por gusto:
oliva a 82°, ciruela a 297°, y dos neutrales de distinto temple —humo frío y piedra cálida— que no
compiten con ningún semántico porque casi no tienen saturación.

**El mapa de módulos.** Nueve grupos, nueve acentos. El grupo, y no la ruta, es lo que lleva color:
así `/pipeline`, `/pipeline/metricas` y `/pipeline/envios` se leen como el mismo lugar.

| Grupo | Rutas | Acento | Por qué |
|---|---|---|---|
| Inicio | `/`, `/buscar` | `navy` | Lo institucional no necesita distinguirse de sí mismo |
| Sueldos | `/sueldos`, `/pagos` | `gold-deep` | El oro es el hilo, y el hilo termina en el pago |
| Pipeline | `/pipeline*` | `cat-mar` | El agua de la lavandería, el recorrido de la prenda |
| Solicitudes | `/solicitudes*` | `cat-oliva` | Lo que la tienda pide y el almacén despacha |
| Inventario | `/inventario` | `cat-arcilla` | La materia: dónde está físicamente cada prenda |
| Lavandería | `/envio-lavanderia` | `cat-ciruela` | Distinto del pipeline, aunque desemboque en él |
| Personas | `/colaboradores`, `/personal`, `/empleados`, `/asistencias`, `/incidencias` | `cat-humo` | Neutral a propósito: son datos de gente, y el color no debe opinar |
| Desempeño | `/reportes*`, `/evaluaciones`, `/valores`, `/mi-desempeno` | `cat-lila` | La cadena que termina en la nota |
| Sistema | `/configuracion*`, `/dispositivos`, `/notificaciones`, `/administracion/auditoria` | `cat-piedra` | Lo que sostiene y no se toca a diario |

**Personas y Sueldos en neutro y en oro, no en un color vivo, es deliberado.** Son las dos zonas con
datos de personas reales: la nota de alguien, su sueldo, sus faltas. Un color alegre alrededor de un
número que decide cuánto cobra alguien es exactamente el tipo de señal que el sistema no debe dar.

**Qué pinta el acento, y qué no.**

| Pinta | No pinta |
|---|---|
| El tramo corto del `hilo-titulo`, junto al oro (§4) | Ningún estado: correcto, error, aviso e información salen siempre de los semánticos |
| El `hilo-activo` y el punto del ítem de menú del grupo | El texto de cuerpo, que sigue en `ink` |
| El borde superior de 2 px de los tiles del módulo | Los botones primarios, que siguen en navy |
| La serie principal de todo gráfico del módulo | El fondo de una pantalla completa |
| El anillo de foco… **no.** El foco es dorado siempre | |

**El foco no cambia de color con el módulo.** Es la única señal de accesibilidad del sistema, y una
señal que cambia de aspecto según dónde estés deja de ser una señal.

### 3.4 Tipografía

**Dos tipografías, con trabajos distintos.** Inter para todo lo que se lee en cantidad y para todo
número —es la que tiene las cifras tabulares que hacen que una columna no baile—, y **Outfit** para
lo que da carácter: títulos, cifras protagonistas y rótulos.

Es la reversión consciente de la Fase 4. Inter sola es exactamente el aspecto corporativo por
defecto: legible, competente y anónima. Outfit es geométrica, de terminaciones redondeadas y anchura
generosa, así que un título deja de leerse como una etiqueta de sistema. Está en Google Fonts, que es
de donde ya se cargan las fuentes.

Nueve tamaños con nombre semántico; **ningún componente vuelve a elegir un tamaño de Tailwind**.

| Token | Tamaño / interlínea | Familia · peso | Otros | Uso |
|---|---|---|---|---|
| `text-cifra` | 48 / .95 | Outfit 700 | `tabular-nums`, `tracking -.03em` | La cifra protagonista de un `StatBox` |
| `text-titulo` | 34 / 1.05 | Outfit 700 | `tracking -.02em` | `h1` de pantalla |
| `text-seccion` | 21 / 1.25 | Outfit 600 | `tracking -.015em` | `h2`, `CardTitle` |
| `text-sub` | 16 / 1.4 | Inter 600 | — | `h3`, subtítulo de bloque |
| `text-cuerpo` | 14 / 1.55 | Inter 400 | — | Texto normal, celda de texto |
| `text-dato` | 14 / 1.4 | Inter 500 | `tabular-nums` | Celda numérica, monto en línea |
| `text-apoyo` | 13 / 1.45 | Inter 400 | — | Subtítulo de cabecera, ayuda de campo |
| `text-rotulo` | 11 / 1.2 | Outfit 600 | `tracking .1em`, mayúsculas | Cabecera de tabla, `LabelGrupo`, sección de sidebar |
| `text-micro` | 11 / 1.3 | Inter 500 | — | `Badge`, metadato, marca de tiempo |

**El corte está en la cantidad de texto, no en la jerarquía.** Todo lo que se lee de un vistazo
—título, cifra, rótulo— es Outfit. Todo lo que se lee de verdad —una celda, una ayuda, un mensaje de
error— es Inter, que es la que resiste párrafos y tablas densas. Poner Outfit en una tabla de
dieciocho filas costaría legibilidad para ganar nada.

**`text-rotulo` es la voz que falta.** Hoy una cabecera de tabla y la fecha de un metadato usan el
mismo `text-xs text-muted`, así que nada rotula nada y todo lo chico se lee igual de secundario. El
rótulo en versalitas espaciadas separa «esto nombra una columna» de «esto es un dato menor» sin
agregar un color más.

Se conserva sin cambios: **nada monoespaciado en el ERP** (guard vigente desde el 21-ago-2026). Las
cifras se alinean con `tabular-nums`, que ya viene dentro de `text-cifra` y `text-dato`.

### 3.5 Espaciado

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

### 3.6 Elevación

Cuatro niveles, y **la sombra se tiñe con el acento del módulo**, nunca es negra ni gris.

| Token | Sombra | Cuándo |
|---|---|---|
| `elev-0` | ninguna, más borde de `line` | Tarjeta plana, contenedor de agrupación |
| `elev-1` | `0 1px 2px acento/8%`, `0 2px 6px acento/8%` | Tarjeta en reposo, barra de filtros despegada |
| `elev-2` | `0 2px 6px acento/10%`, `0 10px 24px acento/14%` | Tarjeta levantada al pasar, popover, menú |
| `elev-3` | `0 10px 24px acento/14%`, `0 32px 64px ink/16%` | Modal, drawer |

**Por qué teñida.** Una sombra gris sobre papel cálido se lee sucia; una sombra del color de lo que
tiene encima se lee como luz. Es el detalle más barato del sistema y el que más separa una interfaz
que parece cara de una que parece una plantilla. `elev-3` conserva un tramo de `ink` porque un modal
tiene que despegarse del fondo de verdad, y sólo con el acento no despega.

**Regla:** la elevación sube al interactuar y vuelve. Nunca es decorativa, nunca queda permanente
por encima de `elev-1`.

### 3.7 Radio

| Token | px | Para |
|---|---|---|
| `r-chico` | 8 | Campo, celda, contenedor chico |
| `r-medio` | 14 | Tarjeta, `StatBox`, grupo de formulario |
| `r-grande` | 22 | Modal, drawer, panel de página, banda de módulo |
| `r-pastilla` | 999 | **Nuevo.** Chip, badge, botón, opción, avatar, contador |

Hoy conviven `rounded-md`, `rounded-lg` y `rounded-xl` sin que la diferencia signifique nada.

**La pastilla es el cambio de carácter más grande después del color.** Un botón de esquina viva a
6 px se lee como un control de sistema; el mismo botón en pastilla se lee como algo que se toca. Va
en todo lo pequeño y accionable —chips, badges, botones, opciones, avatares, contadores— y **no** en
las superficies, que conservan sus esquinas para que la rejilla siga leyéndose como rejilla.

### 3.8 Foco

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

### 3.9 Movimiento

**Tres presupuestos, no uno.** Un único tope de 300 ms deja al sistema rápido y rígido: la misma
duración para confirmar un toque que para cambiar de pestaña hace que ninguna de las dos cosas se
entienda. Lo que se cobra distinto es la frecuencia — cuanto más veces por minuto ocurre algo, más
corto tiene que ser.

| Presupuesto | Tope | Qué entra | Regla |
|---|---|---|---|
| **Repetitiva** | 320 ms | Lo que ocurre muchas veces por minuto: presión, hover, entrada de fila, cruce de esqueleto | Si molesta al trabajo repetitivo, sobra |
| **Contexto** | 500 ms | Lo que ocurre al cambiar de lugar: pestaña, panel, modal, navegación entre lista y ficha | Explica de dónde vino y adónde fue lo que se movió |
| **Momento** | 700 ms | Los cuatro cierres, y el dibujado inicial de un gráfico | Enumerado y cerrado. Nada más lo usa |

| Token | Valor | Para |
|---|---|---|
| `--dur-instante` | 100 ms | Presión sobre un control |
| `--dur-rapido` | 190 ms | Cruce esqueleto a contenido, aparición sin desplazamiento |
| `--dur-base` | 260 ms | Casi todo lo repetitivo |
| `--dur-tope` | 320 ms | Máximo del presupuesto repetitivo |
| `--dur-contexto` | 500 ms | Máximo del presupuesto de contexto |
| `--dur-momento` | 700 ms | Máximo del presupuesto de momento |
| `--escalon` | 60 ms | Retraso entre elementos de una entrada escalonada |
| `--escalon-viz` | 70 ms | Retraso entre series de un gráfico que se dibuja |
| `--curva-rebote` | `cubic-bezier(.34, 1.42, .64, 1)` | **Nueva.** Todo lo que entra: tile, tarjeta, fila, chip, panel |
| `--curva-salida` | `cubic-bezier(.23, 1, .32, 1)` | Lo que sale, y lo que no debe rebotar: modal, drawer |
| `--curva-estado` | `cubic-bezier(.4, 0, .2, 1)` | Cambios bidireccionales: abrir y cerrar, activar y desactivar |
| `--curva-viz` | `cubic-bezier(.33, 1, .68, 1)` | Trazos que se dibujan: línea, anillo, barra |

**`--curva-rebote` es la pieza que cambia el carácter del movimiento.** Sobrepasa el destino un 4 %
y vuelve, y esa sobrecarga mínima es literalmente la diferencia entre «el elemento apareció» y «el
elemento llegó». `ease-out-expo` frena perfecto y por eso se lee como maquinaria; el rebote se lee
como algo que tiene peso.

**Dónde no rebota nunca:** modales, drawers y todo lo que sale de pantalla. Un modal que rebota al
abrirse convierte una decisión en un juguete, y el modal del ERP es lo que precede a cerrar una
liquidación.

---

### 3.10 La banda de módulo

El gesto estructural del modo vibrante, y el que más cambia la primera impresión de una pantalla.

**La cabecera deja de ser texto sobre papel y pasa a ser una banda de color pleno.** Ocupa el ancho
del área de contenido, mide entre 96 y 128 px de alto, lleva un degradado diagonal de
`acento-deep` a `acento`, y encima van las migas, el título en Outfit blanco, el subtítulo y la
acción primaria. **Los tiles se montan sobre su borde inferior, solapándolo 24 px.**

| Regla | Valor |
|---|---|
| Alto | 96 px sin subtítulo, 128 px con subtítulo. **Nunca más** |
| Fondo | `linear-gradient(135deg, acento-deep, acento)` |
| Texto | Blanco puro sobre el degradado; el subtítulo a 78 % de opacidad |
| Radio | `r-grande` abajo, cuadrado arriba: nace pegada al shell |
| Solape | Los tiles suben 24 px sobre el borde inferior |
| Acción | Un solo botón, en `superficie` con texto del `acento-deep` — invierte la relación y por eso se ve |
| Contraste | El blanco sobre las siete familias en su paso `deep` pasa 4.5:1. **Se verifica familia por familia**, no se supone |

**Lo que la banda reemplaza.** El `hilo-titulo` de dos tramos sigue existiendo, pero se muda: ya no
va bajo el título, va **bajo la banda**, como línea de asiento. Así la firma dorada no compite con
un fondo de color, que es donde se habría perdido.

**Dónde no va la banda.** En los formularios operativos, que son una columna centrada de 640 px: una
banda a todo el ancho ahí deja el trabajo pequeño en el medio de una pantalla vacía. Ahí la cabecera
sigue siendo texto sobre papel, con su hilo de dos tramos.

**El costo, dicho de frente:** la banda gasta entre 96 y 128 px de alto que antes eran contenido, y
la decisión de este proyecto fue que manda el escritorio, o sea la densidad. Se acepta porque se
gasta **una vez por pantalla** y devuelve orientación inmediata; si en la fase 6 resulta que empuja
la primera fila de una tabla fuera de la vista en un portátil de 768 px de alto, la banda baja a
72 px y pierde el subtítulo. Eso se decide mirando, no acá.

---

### 3.11 Dos superficies: operario y administración

**El ERP no tiene un solo público, y hasta ahora lo trataba como si lo tuviera.** Un encargado que
audita sueldos en una laptop y una persona que registra prendas de pie en el almacén con el teléfono
en una mano no necesitan la misma interfaz. La densidad que sirve a uno es la que hace fallar al
otro.

Desde esta revisión, **cada ruta declara su superficie**, y la superficie decide tamaños, densidad y
cuánto texto se permite. No lo decide la pantalla.

| | **Operario** | **Administración** |
|---|---|---|
| Rutas | `/reportes/nuevo` · `/envio-lavanderia` · `/pipeline/registrar` · `/valores` · `/solicitudes/nueva` · marcado de asistencia | `/colaboradores` · `/sueldos` · `/evaluaciones` · `/administracion/*` · `/configuracion/*` · `/pagos` |
| Alto mínimo tocable | **56 px** | 40 px |
| Control por defecto | Botón con ícono y palabra | Campo, tabla, filtro |
| Texto de instrucción | **Máximo cinco palabras.** «¿Qué prenda?», no «Selecciona el tipo de prenda que vas a enviar» | Frases completas cuando hagan falta |
| Estructura | Un paso por pantalla, con barra de avance | Todo a la vista, con pestañas |
| Teclado | **Sólo para nombres propios y observaciones libres** | Libre |
| Tablas | Ninguna | Sí |
| Migas y filtros | Ninguno | Sí |

**La regla que ordena todo lo demás: cero teclado.** Todo dato que salga de un conjunto conocido se
elige tocando. Todo número se sube y se baja con `+` y `−`, o se marca en un teclado numérico propio
de doce teclas grandes — nunca el del sistema operativo, que tapa media pantalla y obliga a cerrar
antes de ver qué se escribió.

**Por qué esto importa más que cualquier color.** La adopción está en 4,4 %. La mitad del equipo
llena esto de pie, en el mostrador, muchas veces con las manos ocupadas. Cada desplegable es un
teclado que se abre; cada campo de texto es una oportunidad de escribir mal el nombre de una prenda
y perderla en el pipeline; cada párrafo de instrucción es algo que nadie va a leer dos veces.

**Lo que la superficie de operario prohíbe, y no es negociable:**

1. Ningún campo de texto libre donde exista una lista.
2. Ninguna tabla.
3. Ningún párrafo de más de cinco palabras como instrucción.
4. Ningún control por debajo de 56 px de alto.
5. Ningún paso que muestre dos preguntas a la vez.

**Y una cosa que sí exige:** al terminar, una **confirmación grande** —disco verde, check que se
traza, y qué pasó en una línea—. Hoy el reporte se envía y la pantalla apenas cambia; quien lo mandó
no sabe si salió, así que lo vuelve a mandar.

**«Escritorio manda» sigue vigente, y no se contradice con esto.** La densidad de administración se
calibra para escritorio. La superficie de operario nunca fue una versión reducida de esa densidad:
es otra cosa, con su propia escala.

---

## 4. El hilo dorado como gramática

El oro deja de ser un adorno del título y pasa a ser **un mismo trazo que significa siempre lo
mismo: esto es lo que importa acá**.

| Pieza | Forma | Dónde |
|---|---|---|
| `hilo-titulo` | 2 px horizontal: **2.5 rem de oro, 1.5 rem del acento del módulo**, y el resto en `line` | Bajo la banda de módulo (§3.10), como línea de asiento. En los formularios, bajo el título |
| `hilo-activo` | 3 px vertical a la izquierda, del acento del módulo | Ítem activo de sidebar, pestaña activa. **Reemplaza el fondo tintado** |
| `hilo-progreso` | 3 px horizontal, `scaleX` con `origin-left` sobre pista `line` | Toda barra de progreso del sistema |
| `hilo-fila` | 2 px vertical a la izquierda, dorado | Fila enfocada o seleccionada de una tabla |
| `hilo-cierre` | 2 px que se enhebra de izquierda a derecha, dorado | Los cuatro momentos de cierre de §6 |

**El hilo pasa a tener dos tramos, y ése es todo el cambio de §4.** El oro va primero porque es la
marca y no se negocia; el acento va pegado a continuación porque es el módulo, y cambia. La forma
—una regla fina bajo el título, con un tramo corto encendido— es idéntica a la que ya existe, así
que nadie tiene que reaprender nada: lo que se gana es que la cabecera de Pipeline y la de Sueldos
dejan de ser la misma imagen.

**Cuando se navega entre módulos, el tramo del acento recolorea en 450 ms** (presupuesto de
contexto). Es la única transición de color de pantalla completa del sistema, y existe porque explica
que cambiaste de lugar, no sólo de página.

**Por qué `hilo-activo` reemplaza al fondo tintado.** Un fondo tenue detrás del ítem activo compite
con el fondo tintado que ya usan los estados semánticos, y a media opacidad sobre navy se lee como
suciedad. Un trazo no compite con nada y se lee igual de rápido.

### El sello, y qué archivo va en qué fondo

La marca es un león dentro de un retazo de tela con el borde en zigzag —el corte de tijera de
pinking que se usa en sastrería—, con «LB» al pie. Hay cuatro archivos en juego, y **la variante se
elige por el fondo, nunca por gusto**:

| Archivo | Medida | Dónde |
|---|---|---|
| `logo_lion_white.png` | 211 × 202 | Dentro de la chapa navy: sidebar, topbar móvil, `/dispositivo` |
| `logo_lion_black.png` | 211 × 202 | Marca de agua al 7 % en `EmptyState`, sobre papel |
| `logo_full_white.png` | 677 × 203 | Login, sobre el navy a pantalla completa |
| `logo_full_black.png` | 677 × 203 | Cabecera de todo documento imprimible |

| Regla | Valor |
|---|---|
| Tamaño mínimo | 24 px de alto |
| Aire alrededor | Media altura del sello, en los cuatro lados |
| La chapa | El sello blanco es para fondos oscuros, así que vive dentro de una chapa navy con filete dorado al 55 % y a 3.5 px del borde. Así se ve igual sobre la sidebar que sobre el papel del topbar, sin depender de lo que tenga alrededor |
| Dónde no | Dentro de una tarjeta de contenido, dentro de un modal, repetido en una lista |

La marca de agua del `EmptyState` es la que más cambia el carácter del sistema: hoy un hueco vacío
muestra un ícono gris de la librería y se lee como un error del navegador.

**Tercera pasada del sello, y es la que cierra el asunto.** La marca **ya trae su propio marco**:
el retazo de tela con el borde cortado en zigzag, que es el corte de tijera de pinking de la
sastrería. Meterlo dentro de una chapa redondeada con filete dorado lo enmarcaba dos veces, y a
34 px el león se volvía una mancha.

**Desde ahora el sello va suelto sobre el fondo que le corresponde**, en cuatro tamaños: 26 en la
barra móvil, 34 en la sidebar, 44 en una cabecera, 64 en el login —donde lleva un aura dorada, que
es la única licencia—. La chapa sobrevive sólo donde el fondo no se controla (una foto, un fondo de
sede configurable) o donde el sello tiene que leerse como una etiqueta física, y ahí va **sin filete
interior** y con el sello al 84 %.

En la sidebar del pliego y en el login, el lockup completo reemplaza a chapa más texto: escribir
«LuceBien» al lado de un logotipo que ya dice «LUCEBIEN» era decir lo mismo dos veces.

**Defecto encontrado el 6 de septiembre, que se corrige en la fase 5.**
`components/brand/logo.tsx` define `LOCKUP_RATIO = 677 / 203` y lo aplica a las **dos** variantes del
lockup. Pero `logo_full_color.png` mide **1937 × 1796** — es el sello cuadrado, no el lockup
horizontal. Sobre fondo claro el logo sale aplastado unas tres veces. Salidas posibles: usar
`logo_full_black.png` para fondo claro, que sí es 677 × 203; o generar el lockup a color en esa
proporción y reemplazar el archivo. Se decide con Alexander, porque es material de marca.

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

**Forma, no sólo número.** Cada tile lleva su borde superior de 2 px en el acento del módulo y, donde
hay historia, una `Chispa` debajo de la cifra. Un panel de cuatro números sueltos es exactamente lo
que hace que un ERP se vea viejo: el número dice cuánto, la forma dice hacia dónde. Las tarjetas de
abajo llevan `Anillo` o `Barras` según lo que muestren, y todas se dibujan una sola vez al montar.

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

Tres tramos, según cuántas veces por minuto ocurre la cosa: **repetitiva 300 ms · contexto 450 ms ·
momento 600 ms** (§3.9). El presupuesto de momento está **enumerado y cerrado**: son los cuatro
lugares donde el sistema tiene derecho a hacerse notar porque algo terminó y no tiene vuelta atrás,
más el dibujado inicial de un gráfico.

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

### El catálogo: treinta y seis piezas

Enumeradas porque un catálogo cerrado es lo que separa «el sistema tiene movimiento» de «cada
pantalla anima lo que se le ocurre». Las ocho que ya existen se conservan; las veintiocho nuevas están
marcadas.

Las dos últimas son del modo vibrante: **`icono-pop`** (300 ms) hace que el glifo dentro de su
cuadrado tintado dé un salto a `scale(1.14)` y vuelva cuando su opción se activa — es lo que
convierte un botón de opción en algo que responde; y **`pulso-acento`** (500 ms) expande un halo del
acento desde el control que acaba de completar algo corto: una prenda contada, un accesorio sumado,
una fila marcada. No es confeti: no hay partículas, no hay sonido, y no se dispara en los cuatro
cierres, que tienen su propio hilo.

**Repetitiva — tope 300 ms**

| # | Pieza | Duración | Qué hace |
|---|---|---|---|
| 1 | `presion` **nueva** | 90 ms | Todo lo tocable baja a `scale(.985)`. En pantalla táctil no hay `:hover`: es la única confirmación de que el toque llegó |
| 2 | `hover-color` | 180 ms | Fondo y borde de una fila o control al pasar. Sin gatear: un color pegado no engaña a nadie |
| 3 | `hover-levanta` **nueva** | 240 ms | Tarjeta que sube 2 px y enciende su borde superior con el acento. Gateada con `hover-fine` |
| 4 | `animate-fade` | 220 ms | Aparición sin desplazamiento |
| 5 | `animate-rise` | 280 ms | Entrada de una tarjeta o una fila |
| 6 | `animate-grow-y` | 280 ms | Barra que crece desde la base |
| 7 | `animate-draw-x` | 260 ms | Línea que se enhebra |
| 8 | `cruce-esqueleto` **nueva** | 180 ms | Esqueleto a contenido, en opacidad y sin desplazamiento: la silueta ya coincide |
| 9 | `animate-shimmer` | 1.4 s `linear` | Barrido del esqueleto. Lineal porque un esqueleto que titubea parece colgado |
| 10 | `chip-entra` **nueva** | 200 ms | Un chip de estado que aparece al filtrar o al cambiar de estado |
| 11 | `destello-valor` **nueva** | 400 ms | Fondo del tile cuando su cifra cambió. Es color, no desplazamiento: cabe en el presupuesto |

**Contexto — tope 450 ms**

| # | Pieza | Duración | Qué hace |
|---|---|---|---|
| 12 | `animate-page-enter` | 300 ms | Entrada de pantalla, con la coreografía escalonada de abajo |
| 13 | `pestana-desliza` **nueva** | 360 ms | El `hilo-activo` se desliza de una pestaña a la otra en vez de saltar. Dice cuál dejaste |
| 14 | `animate-scale-in` | 240 ms | Modal o aviso que irrumpe |
| 15 | `animate-drawer-in` | 240 ms | Drawer móvil |
| 16 | `panel-entra` **nueva** | 340 ms | Panel lateral o detalle que se abre al costado |
| 17 | `grupo-expande` **nueva** | 300 ms | Un grupo que se despliega, animando `grid-template-rows` de `0fr` a `1fr` — sin medir alto a mano |
| 18 | `vista-compartida` **nueva** | 420 ms | Avatar y nombre persisten entre lista y ficha |
| 19 | `prenda-avanza` **nueva** | 320 ms | Sale por el borde derecho de su columna y entra por el izquierdo de la siguiente. La prenda se mueve, no desaparece y reaparece |
| 20 | `filtros-pegan` **nueva** | 240 ms | La barra de filtros gana `elev-1` al despegarse |

**Momento — tope 600 ms**

| # | Pieza | Duración | Qué hace |
|---|---|---|---|
| 21 | `hilo-cierre` **nueva** | 600 ms | Se enhebra bajo el título de lo que se cerró. **Sólo cuatro lugares:** liquidación cerrada, reporte de turno enviado, prenda entregada, evaluación firmada |
| 22 | `viz-dibuja` **nueva** | 700 ms, escalón 70 ms | Todo gráfico se dibuja al entrar: la línea se traza, el anillo se llena, las barras crecen desde la base. Una sola vez, al montar — nunca al re-renderizar |
| 23 | `icono-pop` **nueva** | 300 ms · momento | El glifo de un `IconoTinta` da un salto a `scale(1.16)` con leve rotación cuando su opción se activa. Corrige la duración de la primera mención (100 ms): la maqueta la construyó y aprobó en 300 ms |
| 24 | `pulso-acento` **nueva** | 500 ms · momento | Expande un halo del acento desde el control que acaba de completar algo corto: una prenda contada, un accesorio sumado, una fila marcada. No confeti — sin partículas, sin sonido — y no se dispara en los cuatro cierres, que tienen su propio hilo |
| 25 | `banda-entra` **nueva** | 500 ms · contexto | La banda de módulo baja y aparece al montar la pantalla. Es lo primero de la coreografía |
| 26 | `hilo-recorre` **nueva** | 1.6 s en bucle | Un destello dorado recorre el hilo de asiento **mientras algo está en curso**, y se detiene al terminar. Es el único bucle además del esqueleto |
| 27 | `lista-cascada` **nueva** | 320 ms, escalón 40 ms | Las filas de una tabla entran una tras otra, hasta la sexta |
| 28 | `check-dibuja` **nueva** | 700 ms · momento | El check de una confirmación se traza en vez de aparecer. Sólo en la confirmación grande de operario (§3.11) |
| 29 | `chapa-brillo` **nueva** | 700 ms · momento | Un barrido de luz cruza la chapa del sello. **Sólo en el login**, una vez |
| 30 | `progreso-vivo` **nueva** | 1.8 s en bucle | Un brillo recorre la barra de progreso mientras la operación corre. Se apaga al llegar al final |
| 31 | `menu-desliza` **nueva** | 400 ms · contexto | El fondo del ítem activo **se desliza** por la sidebar en vez de saltar. Dice de dónde venís |
| 32 | `numero-rueda` **nueva** | 500 ms · contexto | Los dígitos giran como un odómetro cuando la cifra cambia por una acción, no por una recarga |
| 33 | `fondo-respira` **nueva** | 9 s en bucle | La banda de módulo respira muy lento. Es ambiental: nadie lo mira, y sin él la banda se lee como una imagen pegada |
| 34 | `arrastre-eleva` **nueva** | 200 ms · repetitiva | La prenda se levanta, se inclina 1,5° y proyecta `elev-3` al agarrarla en el kanban |
| 35 | `error-sacude` **nueva** | 300 ms · repetitiva | Sacudida corta del motivo de bloqueo cuando alguien toca un botón deshabilitado. **Lleva el motivo consigo**: no es la sacudida sola |
| 36 | `panel-cortina` **nueva** | 400 ms · contexto | El contenido de una pestaña entra como cortina con `clip-path`. Reemplaza el parpadeo al cambiar de pestaña |

`count-up`, que ya existe, corre junto a `destello-valor` y `viz-dibuja` según dónde esté la cifra.

**Cómo se hace cumplir un catálogo cerrado.** Las veintidós viven como utilidades en
`tailwind.config.ts` y `globals.css`, y ninguna pantalla escribe `@keyframes` propios. La regla
`movimiento` del guard (§9) falla si aparece un `@keyframes` o un `transition-duration` literal
fuera de esos dos archivos.

**Reserva de la vista compartida.** Donde la View Transitions API no exista, el navegador ignora la
propiedad y la navegación queda como está hoy. No hay ruta condicional ni detección: es degradación
natural, y es la única forma de que no haya dos caminos de navegación que mantener.

### Lo que no cambia

Sólo `transform` y `opacity`. Hover con movimiento gateado con `hover-fine:`, hover de color sin
gatear. `prefers-reduced-motion` quita el desplazamiento y conserva color y opacidad a 120 ms.

---

## 7. Componentes

### Seis de estructura

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

### Dos de carácter

| Pieza | Qué es | Por qué |
|---|---|---|
| `BandaModulo` | La cabecera de color pleno de §3.10, con migas, título, subtítulo, acción y el hilo de asiento | Sin una pieza propia, cada pantalla escribiría su degradado y a la tercera habría tres |
| `IconoTinta` | El glifo dentro de un cuadrado redondeado de `acento-soft` con el trazo en `acento-deep`, en tres tamaños (28, 36, 44) | Es lo que más amabiliza una interfaz densa: un ícono suelto sobre papel se lee como decoración de sistema; el mismo ícono con su fondo se lee como un objeto. Lleva `icono-pop` al activarse |

### Tres de operario

Existen sólo dentro de la superficie de operario (§3.11), y su razón es la misma: **sacar el teclado
del medio**.

| Pieza | Qué es | Por qué |
|---|---|---|
| `PasoAsistente` | Una pregunta por pantalla, con barra de avance arriba y un solo botón grande abajo. Cierra con la confirmación grande | Un formulario de nueve grupos en una columna se lee como un trámite. Partido en pasos, cada pantalla tiene una sola cosa que hacer |
| `ContadorMas` | Nombre e ícono a la izquierda, y `−` `valor` `+` en discos de 48 px a la derecha. Se enciende en oro cuando pasa de cero | Escribir «4» en un campo abre el teclado del sistema, que tapa media pantalla. Dos toques no |
| `TecladoNumerico` | Doce teclas de 56 px propias del sistema, para códigos y cantidades largas | El teclado del sistema operativo no se puede estilar, tapa el contexto, y en el celular obliga a cerrarlo para ver qué se escribió |

`ContadorMas` y `TecladoNumerico` **no se usan en administración**: ahí un campo con teclado es más
rápido para quien está sentado con un mouse.

### Cuatro de visualización

Es la capa que hoy no existe, y de donde de verdad sale la sensación de sistema moderno: un ERP se
ve viejo no por sus colores, sino porque muestra números sueltos donde debería mostrar una forma.

| Pieza | Qué es | Dónde |
|---|---|---|
| `Chispa` | Línea de tendencia de 64 × 20, con relleno de área al 12 % del acento y el último punto marcado. Sin ejes ni etiquetas | Dentro de un `StatBox`: puntos del turno, prendas por día, nota por mes |
| `Anillo` | Arco de progreso en SVG con `stroke-dasharray`, la cifra en el centro | Nota sobre 20, avance de una tanda de confección, porcentaje de asistencia |
| `Barras` | Serie corta de barras que crecen desde la base, escalonadas 60 ms, con la barra de hoy destacada | Reportes por sede, prendas por etapa, incidencias por semana |
| `Medidor` | Escala continua con bandas de color y una aguja: dice dónde cae un valor dentro de un rango | Nota mensual dentro de sus tramos, carga de una sede respecto de su capacidad |

**Cuatro reglas para las cuatro, y ninguna es cosmética:**

1. **Una sola escala por gráfico**, y toda etiqueta nombra un valor que el gráfico alcanza.
2. **El color no es la única codificación.** Una barra en rojo lleva además su cifra; una aguja
   lleva su número. La mitad del equipo mira esto en un teléfono al sol.
3. **La serie principal usa el acento del módulo**; los estados —bien, atención, mal— usan los
   semánticos. Un gráfico nunca mezcla las dos gramáticas.
4. **Se dibujan una vez, al montar.** Un gráfico que se re-anima en cada actualización de datos
   convierte una pantalla de trabajo en una pantalla que parpadea.

`Medidor` es la única de las cuatro que **entra sin consumidor confirmado**: sirve para la nota
mensual, pero eso lo decide la pantalla de desempeño. Si al llegar a la fase 3 no tiene un consumidor
real, no entra — la misma regla que borró a `Field` el mismo día que se creó.

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

### El papel: la única salida del sistema que alguien firma

El documento imprimible —constancia de liquidación, comprobante de entrega— **no lleva modo
vibrante**. Cinco reglas, y ninguna es de gusto:

1. **Lockup negro a 38 px**, arriba a la izquierda. El sello a color no va: en una láser se
   convierte en una mancha.
2. **Sin acento de módulo.** En papel el único contraste garantizado es negro sobre blanco.
3. **Sin sombras.** Ya está en `globals.css` (`box-shadow: none !important` en `@media print`).
   Una sombra impresa es un rectángulo gris sucio.
4. **Cifras tabulares.** Es la columna que alguien va a sumar a mano para comprobar.
5. **Margen de 14 mm** por `@page`, que ya existe. Debajo de eso, media impresora recorta la
   última fila.

Esta constancia es lo que una persona firma para decir que recibió su sueldo, y el único artefacto
del sistema que sobrevive fuera de la pantalla. Que se vea serio no es estética: ahí la seriedad
**es** la función.

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
| `movimiento` | Un `@keyframes` o un `transition-duration` literal fuera de `globals.css` y `tailwind.config.ts` | Las treinta y seis utilidades del catálogo de §6 |
| `acento` | Una clase `cat-*` escrita a mano en una pantalla | El acento se toma del grupo de módulo (§3.3), no se elige por pantalla |

La regla `acento` es la que impide que esto se convierta en lo mismo que ya pasó con el color: siete
familias sueltas en 72 pantallas son siete oportunidades de que cada una elija la suya. El acento
sale de una tabla —ruta a grupo, grupo a familia— y de ningún otro lugar.

**Las siete van con línea base congelada.** Hoy fallan en decenas de archivos: las 72 pantallas
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
| **3** | Quince componentes nuevos: seis de estructura, dos de carácter, cuatro de visualización, tres de operario | Typecheck, `next build`, y **cada uno con al menos un consumidor real en la misma tanda** |
| **4** | Ocho componentes afinados | Typecheck, `next build`, guard, y revisión en pantalla de las cuatro faro |
| **5** | Shell, banda de módulo, mapa de acentos por ruta, y la corrección de la proporción del lockup a color | Revisión a 360 px y a 1440 px, los nueve grupos recorridos, y el blanco verificado sobre las siete familias |
| **6** | Las cuatro pantallas faro, más login, estados e impreso | Revisión en pantalla, y **una impresión de verdad** de la constancia |
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
| Quince componentes nuevos sin consumidores reales | Cada uno entra con al menos un consumidor en la misma tanda, o no entra. `Medidor` es el candidato a quedarse afuera |
| **La banda de módulo empuja la primera fila de la tabla fuera de la vista** en un portátil de 768 px de alto | Se mira en la fase 6, en un equipo real del mostrador. Si pasa, la banda baja a 72 px y pierde el subtítulo |
| El blanco sobre una de las siete familias no llega a 4.5:1 en la banda | Se verifica familia por familia con el paso `deep`, antes de la fase 5. No se supone |
| El modo vibrante envejece mal y en un año se lee como una moda | Todo lo vibrante son tokens: radio, curva, tinte de sombra y familia de display. Volver atrás es un bloque de variables, no un rediseño |
| El rebote se propaga a los modales y una decisión irreversible se lee como un juguete | `--curva-rebote` está prohibida en modal y drawer, y eso lo mira la regla `movimiento` del guard |
| Los momentos de 600 ms se propagan | Están enumerados: cuatro cierres más el dibujado de gráficos, y la regla `movimiento` del guard impide declarar duraciones fuera del catálogo |
| **Siete familias categóricas se convierten en siete verdes distintos** — el error que este repo ya pagó, ahora multiplicado | El acento sale de una tabla ruta-a-grupo, nunca de la pantalla, y la regla `acento` del guard falla si una pantalla escribe una clase `cat-*` a mano |
| Un acento cae encima de un semántico y el sistema enseña a leer mal | Las cuatro familias nuevas se eligieron por hueco de tono libre, con los seis tonos ocupados (oro 54°, aviso 35°, error 0°, éxito 155°, info 207°, navy 226°) declarados en §3.3 |
| Treinta y seis animaciones pesan en las laptops del mostrador | Sólo `transform` y `opacity`; los gráficos se dibujan una vez al montar y nunca al re-renderizar; `prefers-reduced-motion` sigue quitando todo el desplazamiento |
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
