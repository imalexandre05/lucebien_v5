# Sistema de diseño del ERP

> **Qué es esto.** Cómo está construida la interfaz del ERP nuevo (`apps/erp-web`): los tokens, los
> componentes compartidos y las tres reglas que no se rompen. El **[manual de
> marca](manual-de-marca.md)** dice qué colores y tipografías tiene LuceBien; este documento dice
> **cómo viven dentro del código**.
>
> **Cuándo leerlo:** antes de pintar cualquier cosa. Sin esto, el camino corto es escribir
> `bg-emerald-600` y agregar el verde número cuatro del sistema.
>
> **Última pasada:** 2026-08-20.

---

## 1. La regla de una línea

**No se usa la paleta por defecto de Tailwind.** Ni `emerald`, ni `amber`, ni `red`, ni `slate`, ni
`sky`. Todo color sale de un token del sistema.

No es purismo. Los verdes y ámbares de Tailwind son fríos al lado del navy y del oro, así que el
sistema se veía apagado; y sin tokens cada pantalla elegía su propio tono — el 20 de agosto había
**tres verdes distintos diciendo lo mismo** repartidos en 67 archivos.

---

## 2. Los tokens

Viven en `apps/erp-web/tailwind.config.ts`. Los que hacen falta fuera de una clase de Tailwind —CSS
suelto, impresión— están espejados en `:root` de `app/globals.css`. **Los dos archivos se editan
juntos:** si no, uno de los dos empieza a mentir.

### Identidad

| Token | Hex | Para qué |
|---|---|---|
| `navy` | `#2e3e6e` | Institucional. Texto fuerte, botón primario, sidebar |
| `navy-dark` · `navy-deep` | `#26335a` · `#1b2440` | Superficies elevadas y fondo máximo |
| `gold` | `#b8a515` | Acento. Líneas, estados activos, el hilo |
| `gold-soft` | `#d4bf1e` | Hover del oro. Es el «Gold Claro» del manual |
| `gold-deep` | `#8a7c10` | **El único oro legible como texto** sobre fondo claro |
| `paper` · `ink` · `line` · `muted` | `#f6f4ef` · `#20283f` · `#e6e0d4` · `#807a6c` | Fondo, texto, borde, texto secundario |

`gold-deep` existe porque había un `#7a6e0e` escrito a mano en veintidós lugares. Si necesitas oro
sobre blanco, es éste; el `gold` normal no llega al contraste de lectura.

### Semánticos

Salen del manual §6. **Cuatro pasos por familia, y cada uno tiene un trabajo:**

| | `soft` (fondo) | `line` (borde) | *(base)* (punto, barra, relleno) | `deep` (texto) |
|---|---|---|---|---|
| `exito` | `#eaf6f0` | `#bfe3d1` | `#2d9e6b` | `#1d6b48` |
| `aviso` | `#fdf3e3` | `#f5d9a8` | `#e08c1a` | `#95590a` |
| `error` | `#fcecec` | `#f2c3c3` | `#c94040` | `#992d2d` |
| `info` | `#eaf2fa` | `#bcd7ee` | `#3a7fc1` | `#255a8f` |

`deep` sobre `soft` pasa 4.5:1 en las cuatro familias. **La base no es para texto largo**: es para
superficie.

La receta de un aviso es siempre la misma: `border-<familia>-line bg-<familia>-soft
text-<familia>-deep`.

### Categóricos — identidad, nunca estado

Distinguen cosas que conviven —un rol, un tipo de lavado— y **no dicen si algo está bien o mal**.
Van agrupados bajo `cat` justamente para que no se confundan: `bg-cat-lila-soft` no se escribe por
accidente creyendo que avisa algo.

| | `soft` | `line` | *(base)* | `deep` |
|---|---|---|---|---|
| `cat-lila` | `#f2eef9` | `#d7cbee` | `#6f5aa8` | `#4e3d7d` |
| `cat-arcilla` | `#fbeee9` | `#f0cfc1` | `#b5643f` | `#8a462a` |
| `cat-mar` | `#e8f3f4` | `#c0dee1` | `#2f7f88` | `#1e5a61` |

Los tres conviven con el navy y el oro sin competirles: el lila continúa el azul del navy, la
arcilla es hermana cálida del oro, y el mar es lo bastante verdoso como para no confundirse con el
azul de `info`.

**Por qué hacían falta.** Los chips de rol estaban pintados con el verde de éxito, y verde ya quiere
decir «correcto» en todo el resto del sistema. Un encargado no es un acierto. Hoy: admin y dueño en
oro, encargados en navy —el color del mando—, confección en lila, ventas en mar.

### Cómo traducir si encuentras Tailwind suelto

Por paso, no por nombre. Un `bg-amber-50` y un `bg-amber-100` querían decir lo mismo:

| Tailwind | Sistema |
|---|---|
| `50`, `100` | `-soft` |
| `200`, `300` | `-line` |
| `400`, `500`, `600` | base |
| `700`, `800`, `900` | `-deep` |

`slate` no es una familia semántica, es gris: va a `paper` / `line` / `muted` / `ink`.

> **Trampa que ya costó.** Si barres con búsqueda y reemplazo, exige que antes del nombre no haya
> una letra. Sin eso, `slate-` se come el `-slate-` de `translate-` y se caen todas las animaciones
> del sistema.

### Esto lo comprueba una máquina

`tools/guard-reglas.sh` tiene una regla `diseno` que falla si aparece una clase de la paleta por
defecto en `apps/erp-web`. Es lo que corre CI, así que no depende de que alguien se acuerde de leer
este documento.

La regla **no usa la secuencia de borde de palabra de las expresiones regulares**: escrita desde un
script, esa secuencia se convirtió una vez en un carácter de retroceso, el patrón dejó de coincidir
con nada y la regla pasó en verde sin mirar un solo archivo. Exige en su lugar que el carácter
anterior no sea una letra, que es lo que de verdad hace falta.

Se probó en las dos direcciones —con una violación inyectada falla y sale con código 1, sin ella
pasa— y conviene volver a probarla así cada vez que se la toque.

### La puerta que el guard no mira: los hexadecimales

Hay tres lugares donde un color **no puede** ser una clase de Tailwind, y son justo los que se le
escapan a la regla `diseno`:

| Dónde | Por qué es hexadecimal |
|---|---|
| Las nueve columnas del pipeline (`app/pipeline/tablero.tsx`) | Cada una se tinta al 8% con `style`, y Tailwind no genera una opacidad calculada por columna |
| Los colores de zona del editor de layout (`app/configuracion/layout/editor.tsx`) | Se guardan en la base y se dibujan con `style` |
| Los colores de tela (`Negro`, `Azul Barcelona`, `Verde petróleo`…) | **No son diseño**: son el color real de una prenda. Se dejan como están |

Los dos primeros eran, hasta el 20-ago-2026, la paleta por defecto de Tailwind escrita en
hexadecimal — es decir, exactamente lo que el sistema dejó de usar, colado por la única puerta que
la máquina no vigila. Hoy salen de los tokens y llevan el nombre del token en un comentario al lado.

**Si agregas un color en `style`, ponle el nombre del token al lado.** Es lo único que va a avisarle
a la próxima persona de que ese valor no es libre.

---

## 3. Movimiento

### El presupuesto

**Ninguna animación de interfaz pasa de 300 ms.** A partir de ahí deja de sentirse como respuesta y
empieza a sentirse como espera.

| Nombre | Duración | Para qué |
|---|---|---|
| `animate-rise` | 280 ms | Entrada de una tarjeta o una fila |
| `animate-page-enter` | 300 ms | Entrada de pantalla |
| `animate-fade` | 220 ms | Aparición sin desplazamiento |
| `animate-scale-in` | 240 ms | Modal, aviso que irrumpe |
| `animate-grow-y` | 280 ms | Barra que crece desde la base (con `origin-bottom`) |
| `animate-draw-x` | 260 ms | Línea que se enhebra (con `origin-left`) |
| `animate-drawer-in` | 240 ms | Drawer móvil |
| `animate-shimmer` | 1.4 s `linear` | Barrido del esqueleto |

La curva es **`ease-out-expo`** = `cubic-bezier(0.23, 1, 0.32, 1)` para todo lo que entra o sale.
Nunca `ease-in` en interfaz: empieza lento justo en el momento que la persona está mirando.

`shimmer` es `linear` porque es movimiento constante. Con curva, el barrido acelera y frena, y un
esqueleto que titubea parece colgado.

### Las tres reglas

1. **Sólo `transform` y `opacity`.** `width`, `height`, `top`, `left` y `margin` disparan layout y
   pintado. Una barra de progreso se hace con `scaleX()` y `origin-left`, no con `width`.
2. **El hover con movimiento va gateado con `hover-fine:`.** En una pantalla táctil, tocar dispara
   un `:hover` que se queda pegado hasta el próximo toque en otro lado; con un `transform`, la
   tarjeta queda levantada y el sistema parece roto. Los hovers de **color** se dejan sin gatear: un
   color pegado no engaña a nadie, y en una laptop táctil gatear de más pierde la señal.
3. **Entrada escalonada de 30 a 80 ms** cuando aparecen varios elementos. Todo junto se lee como un
   parpadeo; escalonado se lee como que la lista se está armando.

### Movimiento reducido

`prefers-reduced-motion` **quita el desplazamiento, no la interfaz**. Las transiciones de color y
opacidad se conservan a 120 ms: una fila que se ilumina al pasar sigue diciendo algo, y quitarla
deja el sistema mudo justo para quien más necesita señales claras. La regla vive en `globals.css`.

---

## 4. Tacto

**`toque`** estira el área tocable de un control a 44 px de alto con un `::after` invisible, sin
cambiar cómo se ve. El ERP es denso a propósito —tablas con acciones chicas por fila— y esa densidad
se pidió expresamente; lo que no se puede pedir es que el pulgar acierte 24 px.

Dos límites, y los dos son a propósito:

- **Sólo alto, nunca ancho.** Dos botones lado a lado se pisarían las áreas y el segundo se comería
  los toques del primero.
- **Sólo con `pointer: coarse`.** En escritorio, áreas invisibles de 44 px sobre controles de 24
  empezarían a robarse clicks entre sí.

Se pone en botones y enlaces con `py-1` o menos. **Nunca en un `span`**: crearía una capa invisible
que se come los clicks de lo que tenga al lado.

---

## 5. Los componentes compartidos

Están en `apps/erp-web/components/ui/`. Antes de escribir uno nuevo, mira si ya existe: casi todos
nacieron de encontrar la misma pieza copiada en nueve pantallas.

| Componente | Qué resuelve |
|---|---|
| `Card` · `CardHeader` · `CardTitle` · `CardContent` | La superficie. Con `interactive` levanta al pasar y **cede al presionar** |
| `Table` | **Trae su propio contenedor con scroll.** Una tabla ancha sin él empuja la página entera de costado |
| `Badge` | Estado en una palabra. Tonos `navy` `gold` `green` `amber` `red` `info` `gray` |
| `StatBox` | Tile de resumen. `tone` acepta un **nombre** (`navy`, `gold`, `exito`, `aviso`, `error`, `info`, `neutro`) |
| `Button` | Variantes `primary` `gold` `outline` `ghost`, con `pending` que deshabilita y pone spinner |
| `Input` · `Select` · `Textarea` · `Label` | Campos. El error se pinta desde `aria-invalid`; `Label` acepta `required` |
| `LabelGrupo` | El título de un **grupo** de controles. No es un `<label>`: no promete una relación que no existe |
| `Aviso` | El mensaje de una operación. `tono` `error` `aviso` `exito` `info` |
| `EmptyState` | El hueco con nombre: ícono, título y qué hacer |
| `Skeleton` · `SkeletonStat` · `SkeletonCard` · `SkeletonPagina` | Siluetas de carga |
| `DialogoConfirmar` + `useConfirmacion` | La confirmación de algo irreversible. Reemplaza a `window.confirm()` |
| `Modal` · `Spinner` · `PersonaPicker` · `ActivoPicker` · `MontoInput` · `OpcionBotones` | Piezas de formulario y diálogo |

### Detalles que no son obvios

**Hubo un `Field`, y se borró el mismo día.** Envolvía etiqueta, control y error atándolos con un
`id` y un `aria-describedby` generados una vez. La auditoría mostró que no tenía **ni un** call site,
y la razón no era que faltara adoptarlo: los formularios del ERP llevan **un** error de nivel
formulario, no uno por campo, y en toda la aplicación hay **una** sola ayuda debajo de un campo. No
había demanda, así que no había pieza — dejarla habría sido código muerto documentado, que es peor
que código muerto a secas.

Si algún día un formulario valida campo por campo, vuelve. Está en el historial.

**`LabelGrupo` no es un `<label>`, y ahí está el punto.** Un `<label>` sin `htmlFor` y sin control
adentro no rotula nada: se anuncia suelto o se ignora, y la persona escucha el campo sin saber de
qué es. Pasaba en tres lugares de Contratos que titulan un widget compuesto o una sección entera. Al
grupo lo nombra su propio `aria-label`, que es donde el lector sí lo busca.

**`Aviso` sólo interrumpe cuando es un error** (`role="alert"`); el resto es `role="status"`.
Anunciar todo con la misma urgencia enseña a ignorar los avisos.

**El asterisco de obligatorio es dorado, no rojo** — obligatorio no es un error todavía — y lleva
texto para quien no ve el color.

---

## 6. Carga y error

`loading.tsx` por ruta. **Sin él, el navegador se queda en blanco hasta que el servidor contesta**, y
eso se lee como lentitud aunque la consulta tarde lo mismo.

- Pantalla con la silueta de siempre —cabecera, tiles, tarjeta— → `<SkeletonPagina />` y listo.
- Pantalla con silueta propia —la lista de colaboradores, el pipeline— → esqueleto a mano. Uno
  genérico no coincide y hace saltar el layout al llegar el contenido, y ese salto se siente peor
  que no haber mostrado nada.

`error.tsx` conviene **dentro** del layout que quieras conservar. El del módulo de colaboradores vive
en `[id]/`, así que si falla Pagos siguen en pantalla la cabecera, el período y las pestañas, y se
puede pasar a Asistencias sin rehacer el camino.

### El resultado de una operación

Tres reglas, y la tercera es la que más se olvida.

1. **El error interrumpe** (`role="alert"`, que es lo que trae `Aviso` con `tono="error"`).
2. **El acierto informa** (`role="status"`). Sin eso, con lector de pantalla la lista se envía y no
   pasa nada audible, que es indistinguible de que hubiera fallado.
3. **No todo acierto necesita una caja.** Una confirmación al lado del botón que la provocó puede
   ser una línea con un check —`role="status"` y nada más—. Anunciar todo con el mismo peso enseña
   a ignorarlo, y entonces el aviso que sí importaba tampoco se lee.

### El error de una lista no cabe dentro de un formulario

Cuando una acción se dispara **desde la lista** —eliminar una fila, suspender a alguien, cambiar un
estado— su error no puede mostrarse en el `error` del formulario o del modal de esa pantalla: en ese
momento ese bloque está cerrado, y el mensaje se renderiza donde nadie lo ve.

Es peor que el `window.alert()` que había antes, porque el alert al menos se veía.

El patrón: un `errorAccion` propio, arriba de todo y siempre a la vista. Está en asistencias,
incidencias, pagos, empleados y los dos catálogos de configuración.

### Confirmar algo irreversible

`window.confirm()` bloquea la página, no se puede escribir en el idioma ni el tono del sistema, y en
el celular se lee como una advertencia del navegador y no de LuceBien. Son justo los diálogos que
preceden a lo que no tiene vuelta atrás — cerrar una liquidación, anular un pago, suspender a una
persona—, así que el aviso más importante del sistema no puede ser el único que parece venir de
afuera.

```tsx
const conf = useConfirmacion();
…
onClick={() => conf.pedir({
  titulo: `¿Cerrar la liquidación de ${nombre} por ${soles(total)}?`,
  detalle: 'Una vez cerrada no se puede modificar. Sólo anular, con motivo, y queda registrado.',
  confirmarLabel: 'Cerrar liquidación',
  alConfirmar: () => …,
})}
…
<DialogoConfirmar {...conf.props} pending={pendiente} error={error} />
```

Cuatro reglas de escritura, y todas salen de lo que el nativo no dejaba hacer:

1. **El dato que decide va en el título.** El monto de la liquidación, el nombre de la persona, la
   cantidad de días. No enterrado en el cuerpo.
2. **El detalle dice la consecuencia**, no repite el título.
3. **El botón dice qué hace** —«Eliminar», «Anular», «Declarar»— y nunca «Aceptar».
4. **El tono separa lo irreversible de lo que sólo conviene mirar dos veces.** Reactivar a alguien
   no es lo mismo que suspenderlo: `peligro` es rojo, `aviso` es ámbar.

El error del intento se muestra **dentro** del diálogo: cerrarlo para leerlo lo haría desaparecer. Y
mientras la acción corre, el diálogo queda abierto con su botón en pendiente, así que nadie vuelve a
tocar.

**Dónde no va.** Dentro de otro modal. Apilar diálogos es peor que el `confirm()`; ahí corresponde
confirmación en línea, en el mismo panel.

### Un control deshabilitado dice por qué

Un botón gris sin explicación se lee como que el sistema falló. Y el ERP se usa de pie y con el
teléfono, sin nadie a quien preguntarle.

El patrón es siempre el mismo, y está en las cuatro pantallas de envío —reporte del turno, Valores
360°, envío a lavandería y nueva solicitud—:

```tsx
const motivoBloqueo = !turno ? 'Elige el turno para poder enviar.' : null;
…
<span id="motivo-envio">{motivoBloqueo ?? 'Se guarda automáticamente.'}</span>
<Button disabled={!puedeEnviar} aria-describedby="motivo-envio">Enviar</Button>
```

Dos detalles que ya costaron: el motivo se calcula **de verdad** —no un solo caso de los cuatro
posibles— y **se ve en el celular**. En el formulario del turno estaba con `hidden sm:inline`, así
que justo donde más falta hacía era donde no aparecía.

---

## 7. Escritura

Es parte del diseño, no un acabado.

- Español neutral, **sin voseo**.
- Frases que dicen qué pasó y qué hacer. «No se pudo guardar: falta la hora de salida» sirve;
  «Ocurrió un error» no.
- Sin signos de exclamación en confirmaciones. Sin «Ups».
- Los números van en `font-mono` con `tabular-nums`: sin eso, una columna de cifras baila al
  actualizarse.
- Un botón deshabilitado **dice por qué**, y lo dice también en el celular.

---

## 8. Lo que falta

1. **Las pantallas comerciales** (`/pedidos`, `/caja`, `/inventario`) recibieron el barrido de
   tokens pero no la revisión de flujo. Son código muerto para el alcance actual, así que no urge.
2. **Modo oscuro.** El manual lo describe para el ERP (§11) y el sistema hoy es claro. No hay tokens
   duales.
3. **Los estados vacíos de las pantallas comerciales.** Los del alcance actual se auditaron el
   20-ago-2026 y están convertidos; quedan sin tocar los de caja, compras, materiales, proveedores e
   inventario, que son código muerto. Cuando un hueco se convierte, la regla es que diga **de dónde
   sale** lo que falta, no sólo que no hay nada.
4. **Seis `window.confirm()` sin convertir.** Cuatro son del módulo comercial (código muerto).
   Uno —deshacer, en el detalle de solicitud— vive dentro de un modal, y ahí corresponde
   confirmación en línea, no un diálogo apilado. El de `configuracion/layout` es un guard de
   navegación, otra forma.

5. **Nada de esto tiene test.** Un cambio de token no rompe ningún test porque no hay ninguno que
   mire la interfaz. La red hoy es el `next build`, el typecheck y el guard —y ninguno de los tres
   se entera de que una clase inventada no pinta nada—. Lo que sí funciona, y conviene repetir
   después de cualquier barrido: sacar del código todas las utilidades de token y comprobar una por
   una que existan en el CSS compilado. Hecho el 20-ago-2026 sobre las 105 que había, todas existen.

6. **El estado de error de los campos no tiene consumidores.** El estilo de `aria-invalid` está en
   la clase base y se activa solo cuando alguien pone el atributo, pero hoy **nadie lo pone**: los
   formularios muestran un `Aviso` arriba y no marcan el campo culpable. Cuesta tres líneas y no
   estorba, así que se queda; pero mientras nada lo use, la promesa de «los campos saben fallar» es
   sólo la mitad. `required` sí tiene tres usos, en Contratos.
