# SPEC — Mis reportes: que el operativo vea el estado de lo que ya envió

> **Zona de rigor: spec corta (nivel 2).** Pantalla nueva sobre datos que ya existen. No toca RLS,
> no toca permisos, no toca la cadena del sueldo — sólo agrega una vista filtrada de `reportes`.

---

## 1. Qué problema resuelve

Hoy quien llena el reporte del turno no tiene ninguna pantalla para volver a ver lo que ya envió.
`/reportes` (en «Interno») es sólo el formulario para cargar uno nuevo
([page.tsx](../../../../apps/erp-web/app/reportes/nuevo/page.tsx)); el historial completo vive en
`/administracion/reportes`, detrás del permiso `reportes_admin`, que un operativo no tiene.

Consecuencia real: una persona no sabe si el reporte que mandó ayer ya fue evaluado, ni qué puntaje
sacó, salvo que alguien se lo diga de palabra o le pase el link directo a `/reportes/<id>`.

## 2. Alcance

**«Mío» significa `reportes.encargado_id = mi usuario`** — quien llenó el formulario de ese turno,
no cada persona listada en `trabajadores[]` dentro del reporte. Un reporte es un artefacto por
turno/sede/fecha, no por persona; extenderlo a "cualquiera que aparezca adentro" es un alcance mayor
que nadie pidió y que reabriría la pregunta de aislamiento del §5 de golpe para todo el equipo del
turno, no sólo para quien lo envió. Si más adelante se quiere eso, es una spec aparte.

**Qué se ve, por fila:** fecha, turno, sede, estado (`evaluado` / `pendiente` / `no_evaluable`) y el
puntaje general si ya está evaluado. **Nada de puntos por extra** — eso ya lo decide
[`page.tsx:61-66`](../../../../apps/erp-web/app/reportes/[id]/page.tsx#L61-L66) (decisión explícita
del dueño, Fase 5 tarea 3) y esta spec no lo toca ni lo repite: la fila sólo linkea a
`/reportes/[id]`, que ya sabe qué mostrarle a quién.

**Dónde vive:** un bloque «Mis reportes recientes» dentro de la misma pantalla de «Reporte de
Actividades» (`/reportes/nuevo`, ya en «Interno»), no una entrada de menú nueva. Es el mismo lugar
al que el operativo ya entra todos los días.

## 3. Diseño

### 3.1 Datos

Función nueva en [`reportes-repo.ts`](../../../../apps/erp-web/lib/reportes-repo.ts):

```ts
listarReportesDe(usuarioId: string, limite = 10): Promise<ReporteResumen[]>
// select id, fecha, turno, sede_cod, evaluado, no_evaluable, puntaje, puntaje_eval
// from reportes where encargado_id = usuarioId
// order by fecha desc, created_at desc
// limit limite
```

**Sin migración y sin política de RLS nueva.** `encargado_id` ya es una columna de `reportes`
([reportes-repo.ts:20](../../../../apps/erp-web/lib/reportes-repo.ts#L20)) y la política de lectura
vigente,
[`rep_select`](../../../../packages/db/migrations/0081_reportes_escritura_directa.sql#L220-L221),
ya es `admin OR almacén OR sede_cod in (select private.app_sedes())` — **por sede, no por
encargado**. Cualquier operativo con acceso a esa sede ya puede leer esas filas hoy; filtrar por
`encargado_id = yo` es un `where` de la aplicación sobre datos que la base ya entrega, no una
puerta nueva.

### 3.2 Pantalla

`/reportes/nuevo/page.tsx` pasa a pedir también `listarReportesDe(sesion.usuario.id)` y se lo pasa
al client component como prop nueva (`misReportes`). Debajo del formulario (o en una pestaña, a
definir en el plan según cómo quede el espacio), una tabla chica:

| Fecha | Turno | Sede | Estado | Puntaje |
|---|---|---|---|---|
| 11-sep | Tarde | LB | 🟢 Evaluado | 32/36 |
| 10-sep | Mañana | LB | 🟡 Pendiente | — |

Cada fila es un link a `/reportes/[id]`. Reusa `Badge`/`ESTADO_TONE` que ya existen en
[`reportes/[id]/page.tsx`](../../../../apps/erp-web/app/reportes/[id]/page.tsx) para no inventar
una segunda paleta de estado.

### 3.3 Qué pasa cuando algo falla

- **Sin reportes todavía** (primer día de alguien): `EmptyState` — "Todavía no enviaste ningún
  reporte." Mismo componente que ya usan notificaciones y solicitudes.
- **Error de red/consulta:** el bloque se degrada solo (no tira el formulario de arriba, que es lo
  que importa de verdad ese día) — mismo criterio que el resto del módulo: sin 500, sin bloquear lo
  operativo por un problema en lo secundario.
- **`encargado_id` nulo** (no debería pasar — `reportes_crear` siempre lo fija — pero si pasara): la
  fila no aparece en la lista de nadie. No es un caso a manejar especial, es un dato faltante que ya
  cae fuera del filtro.

## 4. Hallazgo aparte, no bloquea esta spec

Mientras se verificaba el punto anterior apareció algo que no es parte de este trabajo: la política
de `reporte_extras` ([0081, línea 266](../../../../packages/db/migrations/0081_reportes_escritura_directa.sql#L266))
es la misma condición por sede que `reportes` — **no hay recorte de columna a nivel de base** para
`puntos_total`. La Postgres RLS no distingue columnas (mismo punto que ya explica la spec de
solicitudes del 23-ago), así que el corte de la Fase 5 es sólo de interfaz: alguien con acceso a la
API de Supabase (no a la pantalla) podría leer `puntos_total` de cualquier reporte de su sede.

No es una regresión de este cambio — ya existía. Esta spec no lo agranda (la fila de «Mis reportes»
no expone esa columna en ningún lado) ni lo corrige (cerrarlo bien es una política de columna o una
vista, permisos/RLS = nivel 3, con su propia spec y verificador). Queda anotado en
`docs/pendientes-negocio.md`.

## 5. Cómo se comprueba

| # | Caso | Esperado |
|---|---|---|
| 1 | Usuario con 3 reportes propios, 2 evaluados y 1 pendiente | Ve las 3 filas, estado y puntaje correctos en las 2 evaluadas |
| 2 | Usuario sin reportes | Ve el `EmptyState`, no un error |
| 3 | Usuario A ve la lista de Usuario B (mismo rol, distinta persona) | Usuario A **no** ve los reportes de B en su bloque — cada quien ve `encargado_id = su propio id` |
| 4 | Click en una fila | Lleva a `/reportes/[id]` y esa pantalla se comporta exactamente igual que hoy (puntaje sí, puntos de extra no) |
| 5 | Reporte evaluado y luego anulada su evaluación (`accionAnularEval`) | El bloque refleja el estado nuevo tras `revalidatePath` (ya cubierto por las rutas que esa acción revalida) |

## 6. Lo que esta spec NO hace

- No cambia quién puede ver qué en `/reportes/[id]` — usa el gate que ya existe.
- No agrega ninguna columna, tabla ni política de RLS.
- No expone puntos de extras al operativo — sigue siendo decisión del dueño, sin tocar.
- No resuelve el hallazgo del §4 — sólo lo deja escrito para que alguien decida si se cierra.

---

**Implementado el 12-sep-2026** (plan: `docs/superpowers/plans/2026-09-12-mis-reportes.md`).
Verificado: `tools/verificar-local.sh` en verde y la prueba e2e
(`e2e/colaborador.mis-reportes.spec.ts`) corrida contra `erp-dev` (puerto 3005) con sesión real de
`Prueba Admin`/`Prueba Colaborador` — **3 passed**. Cerrado.
