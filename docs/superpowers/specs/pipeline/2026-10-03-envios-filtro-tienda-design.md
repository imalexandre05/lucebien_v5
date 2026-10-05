# SPEC — Envíos a tienda: filtrar por tienda y por fecha

> **Ticket:** imalexandre05/lucebien-tablero#7. **Zona de rigor:** spec corta (filtro y vista
> nueva sobre datos que ya existen, `docs/rigor-por-zona.md` nivel 2). Sólo lectura: ninguna
> escritura sobre `prenda_pasada` ni sobre `envios_prendas` (no-negociable 2), y no se tocan RLS
> ni esquema.

## 1. Problema

El cliente pide dos cosas: que cada tienda vea sólo lo que el almacén le envió y poder filtrar los
envíos por tienda.

- **La restricción ya existe en la base** y la pantalla no la tiene que reimplementar. Se verificó
  contra `pg_policies` del proyecto `scilb` el 03-oct-2026: `envios_rw` sobre `envios_prendas`
  deja ver una fila sólo si `app_es_admin() or app_es_almacen() or sede_destino_cod in app_sedes()`.
  La creó `0006_pipeline_rls.sql:68-72` y ninguna migración posterior la redefinió. La `0037` sólo
  movió los helpers al esquema `private`.
- **No hay filtro.** `/pipeline/envios` agrupa por sede destino, pone «tu sede» primero y no
  ofrece selector. Quien ve todas las sedes (admin, dueño, almacén) recibe todo mezclado.
- **El tope de 300 esconde envíos pendientes.** `listarPrendasEnviadas()` trae 300 filas con
  `enviado` y `recibido` juntas, ordenadas por `fecha_actualizado desc`. Con muchas recepciones
  recientes, una prenda en camino más vieja queda fuera del corte, y la tienda no puede
  confirmarla porque no la ve. Además el filtro `.filter(r => r.envios_prendas)` corre *después*
  del `limit`: las prendas cuyo envío la RLS oculta igual consumen cupo.

## 2. Qué cambia

**Filtros por URL** (`?sede=TR&desde=2026-09-01&hasta=2026-09-30&pag=2`). Un enlace filtrado se
puede compartir, y el filtro sobrevive a la recarga que hace «Aceptar»/«Observar». Viven en la
`BarraFiltros` del sistema de diseño, con «Limpiar» cuando hay alguno activo.

- **Selector de tienda.** Botones (`OpcionBotones`) con el nombre de cada tienda: un toque y
  filtra, sin pasar por «Aplicar», porque son 3 o 4 y un `<select>` esconde las opciones. Las
  opciones son las sedes destino que la persona puede ver:
  - admin, dueño, `encargado_almacen` y `confeccionista`: todas las sedes del catálogo que no son
    de perfil `almacen`, las mismas que el kanban ofrece como destino de despacho, más «Todas».
  - el resto: sus tiendas (`sesion.usuario.tiendas`).
  - **Con una sola opción no hay selector**: la RLS ya le muestra únicamente lo suyo.
  - Si el valor de `sede` en la URL no está entre las opciones, se ignora y se muestra «Todas»
    (lo que la RLS deje ver). No es un control de acceso: si alguien pasara una sede ajena, la RLS
    igual devolvería cero filas. Es higiene para no aparentar un filtro que no aplica.
- **Rango de fechas** (`desde`/`hasta`, `YYYY-MM-DD`, ambos opcionales). Filtran por la fecha del
  envío (`envios_prendas.fecha`, `timestamptz`) **interpretada en hora Perú** (no-negociable 4):
  `desde` es `>= desdeT00:00:00-05:00` y `hasta` es `< (hasta+1)T00:00:00-05:00`. Una fecha mal
  formada se ignora. Si `desde > hasta`, se intercambian.
- **El rango sólo filtra el historial («Recibidas»), no lo que está en camino.** La lista en
  camino es una cola de trabajo pendiente: esconder una prenda por fecha haría que la tienda se
  olvidara de confirmarla. La tienda sí filtra las dos.

**Consultas separadas y filtradas en la base**, no en el cliente:

1. `listarEnviosEnCamino({ sede })`: `etapa = 'enviado'`, con un join `envios_prendas!inner` para
   que la RLS y el filtro de sede actúen antes del `limit`. Tope: 1000, **default de pantalla**
   comentado en `envios-repo.ts`. Coincide con el `max_rows` por defecto de PostgREST en Supabase,
   pero este repo no versiona esa configuración. Es una cola operativa de 4 sedes con despachos
   diarios: lo esperable son decenas. Si se alcanza el tope, la pantalla lo avisa con un `Aviso`
   en vez de cortar en silencio.
2. `listarEnviosRecibidos({ sede, desde, hasta, pagina })`: `etapa = 'recibido'`, mismo join,
   paginado de a 50 con `range()`. Se pide una fila extra para saber si hay página siguiente, sin
   `count`. Navegación «Más recientes / Anteriores». Reemplaza el `.slice(0, 20)` del cliente.

La lógica de qué sedes puede filtrar cada quien y cómo se leen los parámetros es pura y vive en
`packages/core/src/envios.ts` (`sedesFiltroEnvios`, `leerFiltrosEnvios`, `limitesRangoPeru`), con
tests en `envios.test.ts`. Es un archivo propio y no `pipeline.ts`, para no pisar a otros PR
abiertos sobre el pipeline. El repo
sólo traduce el filtro a la consulta.

## 3. Cuando algo falla

- Error de la consulta: se lanza como hoy y lo atrapa el `app/error.tsx` global.
- Sin resultados con filtro: el estado vacío dice que no hay envíos para ese filtro y ofrece
  limpiarlo.
- Página fuera de rango (`pag` muy alta o no numérica): se trata como página 1 si no es un entero
  positivo. Si está vacía, el estado vacío ofrece volver a la primera.

## 4. Fuera de alcance (hallazgo para un ticket aparte)

`pasada_rw` sobre `prenda_pasada` filtra por **sede de origen**
(`sede_origen_cod in app_sedes()`), no por destino. Verificado en `pg_policies` el 03-oct-2026.
Como la pantalla lee desde `prenda_pasada`, una tienda sólo ve una prenda enviada cuando **origen
y destino** son ambos suyos. Una prenda que vino de otra sede y se despachó a esta tienda queda
invisible para la tienda, y no puede aceptarla ni observarla. No es una fuga, porque nadie ve de
más. Es una restricción de más, y tocarla es RLS (zona crítica): no se arregla acá.
