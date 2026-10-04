# SPEC — Asistencia por día, semana y mes

> **Qué es.** Poder mirar la asistencia de un día, de una semana o de un mes (o de un rango
> cualquiera) y moverse al anterior o al siguiente, en `/asistencias` y en `/sueldos/asistencia`.
> Ticket: `imalexandre05/lucebien-tablero#4`.
>
> **Zona de rigor:** spec corta. Es lectura: no cambia qué se guarda, ni la RLS, ni la cadena del
> sueldo. Los helpers de fecha nuevos van al core con test.
>
> **Estado:** escrita el 3-oct-2026, verificada contra el código de `main` (8eb4465).

---

## 1. Lo que hay hoy (verificado contra el código)

- `/asistencias` (`app/asistencias/cliente.tsx`): filtra en el navegador por persona, **un día
  exacto** (`<input type="date">`), turno y fuente. El servidor trae las **últimas 300 filas**
  (`listarAsistencias()`, `.limit(300)`): con 18 personas eso es menos de un mes, así que un mes
  anterior no se podía ver aunque se eligiera el día.
- `/sueldos/asistencia` (`page.tsx`): elige un contrato (`?acuerdo=`) y muestra **todo** su
  período. No hay forma de acotar a una semana o a un día.

## 2. Qué cambia

Un selector de rango compartido, `components/ui/selector-rango.tsx`:

| Vista | Rango | Anterior / siguiente |
|---|---|---|
| Día | el día | ±1 día |
| Semana | **lunes a domingo** que contiene el ancla | ±7 días |
| Mes | día 1 al último del mes calendario | ±1 mes |
| Rango | `desde` … `hasta` elegidos a mano | se corre su propio largo |

Más un botón «Hoy» que vuelve al período que contiene `hoyPeru()`.

**Semana = lunes a domingo.** Es la convención que el repo ya usa para leer por semana:
`claveBucket()` de `estadisticas.ts` agrupa por el lunes, y `diaSemanaISO()` de `sueldos.ts`
numera 1 = lunes … 7 = domingo. Los `tramosSemanales()` de RN-12 **no** son semanas calendario:
son tramos de 7 días anclados en el inicio del contrato y deciden el bono. Esta vista no los toca
ni los reemplaza.

**En la URL.** `?vista=dia|semana|mes|rango&desde=YYYY-MM-DD&hasta=YYYY-MM-DD`. En día, semana y
mes manda `desde` como ancla y `hasta` se recalcula; en rango mandan los dos (si vienen al revés,
se dan vuelta, igual que `leerPeriodo()`). Una fecha inválida (`2026-02-30`, basura) se descarta:
en día, semana y mes el ancla pasa a ser **hoy**; en rango, el extremo inválido se completa con el
otro, y si los dos son inválidos, con hoy. Una `vista` desconocida cae a la vista por defecto de la
pantalla. Un enlace copiado muestra exactamente lo mismo.

**Hora Perú.** El «hoy» sale de `hoyPeru()` en la app y entra al core como parámetro. El core no
llama `new Date()` (no-negociable 4).

### `/asistencias`

- Default sin parámetros: **mes en curso**. Es una elección de pantalla, no una regla de negocio.
- El servidor trae las filas del rango (`listarAsistencias(desde, hasta)`), paginando de a
  1000 para no chocar con el tope de PostgREST. Desaparece el tope silencioso de 300.
- **El rango personalizado se limita a 366 días** (`MAX_DIAS_RANGO`). Es un default de pantalla
  —un año entero más un día bisiesto—, no una regla de negocio: existe para que una URL como
  `desde=1900-01-01&hasta=9999-12-31` no recorra la tabla entera. Si se excede, se conserva
  `hasta` y se recorta `desde` a 366 días antes, y la pantalla lo dice con un aviso.
- Se quita el `<input type="date">` de día exacto: lo reemplaza la vista Día. Persona, turno y
  fuente siguen como filtros en el navegador.

### `/sueldos/asistencia`

- Default sin parámetros: **contrato completo** (lo de hoy). Se suma la opción «Contrato» al
  selector para volver ahí.
- Con otra vista, la tabla muestra sólo los días del contrato que caen dentro del rango. Si el
  rango no toca el contrato, se dice eso en vez de una tabla vacía.
- Los contadores «Días contratados» y «Sin declarar», y el aviso que frena la liquidación,
  **siguen siendo del contrato entero**: lo que bloquea `sueldo_entrada` es el período completo, y
  achicar la vista no puede esconderlo. El botón «Declarar … como trabajados» actúa sobre los días
  **visibles** y lo dice en su texto cuando la vista está acotada.
- Los cambios sin guardar se conservan al cambiar de vista, pero un día que queda fuera de la
  vista no se ve. Si hay cambios sin guardar en días que no están en pantalla, un aviso dice
  cuántos son, qué fechas, y que se ven volviendo a «Contrato». Un cambio sin guardar no está en
  la base: esconderlo sin avisar haría creer que se guardó.
- `/personal/[id]/asistencias` reusa el mismo cliente y **no cambia**: ahí ya manda la barra de
  período del módulo, y la spec de colaboradores dice que el grano es el contrato.

## 3. Aislamiento

Nada nuevo. Las dos pantallas siguen siendo del administrador/dueño, las lecturas usan
`getServerClient()` (RLS) y no se agrega ningún uso de `getAdminClient()`.

## 4. Pruebas

`packages/core/src/rangos-fecha.test.ts`: semana de lunes a domingo (incluye domingo y cruce de
mes y año), meses de 28/29/30/31 días, desplazamiento de mes desde el 31, rango personalizado
invertido y desplazado, fechas inválidas que caen a hoy, y el recorte del rango a 366 días.
