# Personal (fusión R1–R4) · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development`.
> Spec: [2026-08-23-personal-fusion-design.md](../specs/sueldos/2026-08-23-personal-fusion-design.md).
> Tareas en serie salvo que se indique lo contrario (varias tocan los mismos archivos).

**Objetivo:** una sola entrada «Personal» donde se entra por la persona y está todo el flujo;
herramientas del periodo adentro; alta encadenada; sueldo único desde el contrato; la
liquidación es el pago (abonos con saldo).

## Restricciones globales

Las de siempre (`CLAUDE.md`, `docs/sistema-de-diseno.md`):
- `packages/core` **no se toca** en ninguna fase.
- Migraciones: **solo R4**, con reserva previa (`bash tools/reservar-migracion.sh`) commiteada y
  pusheada ANTES de escribirla. Idempotente. Zone Guard: spec y código nunca en el mismo commit.
- Tokens del sistema, nunca la paleta por defecto de Tailwind. `tabular-nums` en números.
- `hoyPeru()` para «hoy». Español neutral sin voseo. Sin exclamaciones.
- Cada pantalla conserva su permiso actual — la fusión de navegación no amplía visibilidad
  (no-negociable 3). Toda consulta por `getServerClient()`; `getAdminClient()` sigue en sus 6
  archivos.
- Antes de cada commit: `bash tools/verificar-local.sh`. Staging siempre por archivo, nunca
  `git add -A`.
- Commits: Conventional Commits en español, scope `erp` (o `migration` en R4).

## Datos del mapa (23-ago) que las tareas usan

- Módulo actual: `app/colaboradores/` (lista + `[id]` con layout, cabecera, BarraPeriodo,
  NavSecciones). Catálogo de pestañas: `lib/colaboradores-secciones.ts` (`SECCIONES`, orden =
  orden del array; `rutaSeccion()` arma las URLs — **un solo lugar**).
- Sidebar Administración: Colaboradores (`evaluaciones` + alternos `pagos`,`sueldos`), Sueldos
  (`sueldos`), Liquidaciones (`sueldos`), Empleados (`empleados`) — líneas ~70-90 de
  `components/shell/sidebar.tsx`.
- Ficha de empleados: `app/empleados/cliente.tsx` (modal `EditarModal` L479+, campos nombre,
  rol, sede, tiendas, fechaIngreso, teléfono, DNI, dirección, **salario L691-698**, contraseña);
  actions en `app/empleados/actions.ts`; repo `lib/empleados-repo.ts` (RPC
  `empleado_actualizar`). El alta (`NuevoEmpleadoInput`) NO captura salario.
- Pagos viejos: tabla `pagos` (0001 + 0057), `evaluacion_id`→evaluaciones, SIN relación con
  `sueldo_liquidaciones`. **Bug:** `eliminarPago()` (`lib/pagos-repo.ts:199-203`) hace DELETE
  aunque la UI promete «anulado a la vista» y la columna `anulado` existe sin escritor.
- `sueldo_liquidaciones` (0072): sin ningún campo de pago. Estados borrador/cerrada/anulada.
- Exports reutilizables ya montados por persona: `AsistenciaCliente`, `PagosCliente`,
  `EvaluacionesCliente`, `AcuerdosCliente` (con `personaFija`, F1.5).

---

## R1 — El apartado Personal

### Tarea 1: Mover el módulo y fusionar el menú

**Archivos:** `git mv apps/erp-web/app/colaboradores apps/erp-web/app/personal` (todo el
árbol) · `lib/colaboradores-secciones.ts` (solo `rutaSeccion()`: `/colaboradores/` →
`/personal/`) · `components/shell/sidebar.tsx` · páginas de redirect nuevas en
`app/colaboradores/`.

1. `git mv` del directorio completo. Grep de `'/colaboradores` en `apps/erp-web` y ajustar todo
   enlace restante (`rutaSeccion`, links en dashboard/topbar/buscar si los hay) a `/personal`.
2. Redirects: crear `app/colaboradores/page.tsx` y `app/colaboradores/[id]/[[...resto]]/page.tsx`
   mínimos que hagan `redirect('/personal'+resto+query)` (server, con `next/navigation`).
   Igual para `/empleados` → `/personal` **todavía NO** (la gestión sigue ahí hasta T3) y
   `/sueldos` (hub) → **queda** hasta T2 (la portada nueva lo reemplaza como punto de entrada).
3. Sidebar: quitar las entradas Colaboradores, Sueldos, Liquidaciones y Empleados; agregar
   `{ label: 'Personal', href: '/personal', icon: UsersRound, modulo: 'evaluaciones',
   modulosAlternos: ['pagos', 'sueldos', 'empleados'] }` en su lugar (posición de Colaboradores).
   `empleados` entra a los alternos para que quien solo tenía Empleados no pierda acceso.
   Comentario que explique la fusión y la fecha.
4. `verificar-local` + commit `feat(erp): el modulo de personas vive en /personal y el menu queda con una entrada`.

**Produce:** `/personal` y `/personal/[id]/*` funcionando idéntico a lo que era colaboradores;
rutas viejas redirigen.

### Tarea 2: La portada — herramientas del periodo

**Archivos:** `app/personal/page.tsx` y/o `app/personal/cliente.tsx`.

Arriba de la lista existente, una fila compacta «Herramientas del periodo» (Cards chicas o
enlaces con ícono, mismo estilo del hub `/sueldos` que F1 creó): Declarar asistencia
(`/sueldos/asistencia`) · Ventas y metas (`/sueldos/ventas`) · Adelantos y descuentos
(`/sueldos/movimientos`) · Liquidar el periodo (`/sueldos/liquidaciones`) · Contratos
(`/sueldos/acuerdos`) · Evaluaciones del mes (`/evaluaciones`). Gate: cada enlace se muestra
solo si el rol tiene el módulo de esa pantalla (usar `puede()` como hace el sidebar — los
módulos: sueldos×5, evaluaciones). Botón «Nueva persona» se agrega acá pero deshabilitado con
motivo («llega con el alta encadenada») hasta T6, o directamente se omite hasta T6 — omitirlo.
`app/sueldos/page.tsx` (hub F1) pasa a `redirect('/personal')` (su contenido queda absorbido).
Commit `feat(erp): la portada de Personal reune la lista y las herramientas del periodo`.

### Tarea 3: La pestaña Datos

**Archivos:** `lib/colaboradores-secciones.ts` (nueva clave `datos` PRIMERA en el array,
segmento `datos`, módulo `empleados`, ícono `IdCard` o `User`) ·
`app/personal/[id]/datos/page.tsx` (nueva) · reuso de `app/empleados/` (leer y decidir el
mínimo: la página monta el formulario de edición existente para UNA persona — si `EditarModal`
no se puede montar suelto, extraer el formulario a un componente compartido SIN duplicar campos;
el archivo real manda).

- Gate: mismo del `/empleados` actual (admin/dueño). Reauth si `/empleados` la exige.
- Muestra y edita: nombre, rol, sede, tiendas, fecha de ingreso, teléfono, DNI, dirección,
  contraseña — **incluido salario por ahora** (sale en T7/R3, no acá: una tarea, un tema).
- `/empleados` (la página) pasa a `redirect('/personal')`.
- Commit `feat(erp): la ficha de la persona vive en su expediente como pestaña Datos`.

### Tarea 4: El pago viejo deja de mentir al anular

**Archivos:** `lib/pagos-repo.ts` (`eliminarPago` → `anularPago`: `update anulado=true` con
`.eq('id')`) · `app/pagos/actions.ts` (renombrar acción y mensaje) · `app/pagos/cliente.tsx`
(que el handler llame la nueva acción; el diálogo ya promete lo correcto).
La lista debe seguir mostrando anulados marcados (la UI ya lee `anulado`). Nada de DELETE.
Commit `fix(erp): anular un pago ahora conserva la fila marcada, como la pantalla siempre prometio`.

### Tarea 5: Revisión de fase + validador de flujo R1

1. Paquete de revisión de R1 completo (T1..T4) → revisor de tarea normal.
2. **Validador de flujo** (agente aparte, adversarial): recorre el código como el admin —
   entra a Personal, abre a una persona, recorre las 8 pestañas, vuelve, usa una herramienta,
   navega por una ruta vieja (`/colaboradores/X`) y confirma el redirect con query intacta.
   Reporta callejones sin salida, enlaces rotos, permisos que cambiaron. Roturas se corrigen
   en la fase; fricciones se anotan.

---

## R2 — Alta encadenada

### Tarea 6

**Archivos:** `app/personal/nuevo/page.tsx` (nueva) · botón «Nueva persona» en la portada ·
reuso del formulario de alta de `app/empleados/` (mismo criterio de extracción que T3) ·
`app/personal/[id]/contrato/page.tsx` (soportar `?continuar=alta` para abrir el editor de
contrato directamente).

Flujo: portada → `Nueva persona` → formulario de datos (el alta actual: nombre, rol, sede,
acceso; SIN salario — nunca lo tuvo) → al crear, `redirect('/personal/{id}/contrato?continuar=alta')`
→ el editor de contrato se abre solo (el `AcuerdosCliente` con `personaFija` ya precompleta la
fecha con el ingreso — F1.5) → al pactar, el expediente queda abierto. Si se interrumpe: la
lista ya marca sin-contrato por el hilo (paso contrato en corte); verificar que el marcado
ámbar sea visible y con enlace directo, y reforzarlo si no.
Commit `feat(erp): registrar a una persona encadena datos, contrato y horario de corrido`.

---

## R3 — Sueldo único

### Tarea 7

**Archivos:** el formulario de Datos (donde haya quedado tras T3) · `app/pagos` y
`app/evaluaciones` NO se tocan (consumidores congelados, spec §2.5).

- Quitar el input de salario del formulario (y del payload de la acción de edición — no enviar
  el campo; la RPC `empleado_actualizar` acepta el parámetro como opcional o se manda el valor
  actual sin cambio: **leer la RPC en 0050 y decidir por el camino que no la rompa**).
- En su lugar, lectura del contrato vigente: «Sueldo (contrato vigente): S/ X · ver contrato» →
  enlace a la pestaña Contrato; sin contrato vigente: «Sin contrato — pactarlo» con enlace.
  Dato: `listarAcuerdos(empleadoId)` ya existe; vigente = `estado === 'vigente'` (si hay más de
  uno, el de `fechaInicio` más reciente).
- Anotar en `docs/pendientes-negocio.md` (commit aparte de docs): columna `salario_base`
  huérfana de UI; consumidores congelados (`sugerirMontoPago`).
- Commit `feat(erp): el sueldo se lee del contrato vigente y deja de editarse en la ficha`.

---

## R4 — La liquidación es el pago (zona crítica)

### Tarea 8: Migración

1. `bash tools/reservar-migracion.sh liquidacion_pagos` → commit y push de la reserva SOLA.
2. Escribir la migración: tabla `sueldo_liquidacion_pagos` (id, liquidacion_id FK, fecha,
   monto numeric>0, metodo text, nota text, registrado_por, anulado bool default false,
   anulado_motivo text, anulado_por, created_at) + RLS (colaborador SELECT solo de sus
   liquidaciones — mismo patrón `sueldo_liquidacion_es_mia()` de la 0072; escritura solo admin
   vía RPC) + RPC `sueldo_liquidacion_pagar(p_liquidacion_id, p_fecha, p_monto, p_metodo,
   p_nota)` que valida: liquidación existe y `estado='cerrada'`; monto > 0; suma de pagos no
   anulados + p_monto ≤ total de la liquidación. RPC `sueldo_liquidacion_pago_anular(p_pago_id,
   p_motivo)` con motivo obligatorio. Idempotente. Catálogo de métodos en `config`
   (`sueldo_metodos_pago`, default `Efectivo,Yape,Plin,Transferencia,Otro`) editable en
   `/configuracion` — default comentado como tal.
3. Archivo de prueba en `packages/db/pruebas/` que INTENTE ROMPER: pagar un borrador (falla),
   pagar de más (falla), monto 0 (falla), anular sin motivo (falla), update directo del pago
   (falla por falta de policy), pagar una anulada (falla), y el camino feliz con dos abonos que
   suman exacto. Todo dentro de transacción con rollback.
4. Aplicar contra `scilb` a mano, correr la prueba, y RECIÉN entonces anotar «aplicada y
   verificada» en la spec (regla 6 del harness). Commits separados: reserva · migración ·
   docs.

### Tarea 9: Repo, acciones y pantalla

**Archivos:** `lib/sueldos-repo.ts` (agregar `listarPagosLiquidacion`, `pagarLiquidacion`,
`anularPagoLiquidacion` — envuelven las RPC/tabla) · `app/personal/[id]/pago/page.tsx` se
convierte en **Liquidación y pago**: liquidaciones de la persona (de `listarLiquidaciones({
empleadoId })`) con su desglose enlazado, y en cada cerrada: total · pagado · saldo · lista de
pagos · formulario de abono (fecha `hoyPeru()`, monto, método de `config`, nota) · anular con
motivo vía `DialogoConfirmar`. Los pagos viejos de la tabla `pagos` quedan colapsados abajo
(«Pagos registrados antes del sistema de liquidaciones», solo lectura). La sección en
`SECCIONES` renombra su label a `Liquidación y pago`. Aclaración visible: «Los adelantos ya
están descontados dentro del total — acá se registra lo pagado del total». `/pagos` sale…
ya salió del menú en T1 (no estaba); confirmar que ningún enlace interno quede apuntando.
Commit por partes si conviene (repo · pantalla).

### Tarea 10: Verificador adversarial de R4

Subagente `verificador` sobre la migración + RPC + repo + pantalla: su objetivo es encontrar el
fallo (pagar de más con dos requests, RLS que filtre pagos ajenos, borrador pagable, motivo
vacío, suma con anulados contada mal). Hallazgos Critical/Important se corrigen y se re-verifica.

### Tarea 11: Validadores de flujo de negocio + cierre

Tres agentes en paralelo (leen código, no proponen — reportan fricción con archivo:línea):
1. **Lunes, empleado nuevo**: alta encadenada completa hasta su primer día declarado.
2. **Fin de mes**: asistencia → ventas → nota → liquidar → cerrar → pagar en dos abonos; el
   adelanto de mitad de mes aparece descontado y no se puede duplicar como pago.
3. **«¿Cuánto cobro y por qué?»**: del expediente al desglose en ≤2 clics.

Después: `verificar-local` completo + `pnpm --filter erp-web build` (patrón PM2: stop erp-dev,
build, start — NUNCA `pnpm install` para un lock) + marcar spec construida + fila en
`aprendizajes.md` si algo salió mal + push de la rama.

## Lo que este plan NO hace

- No toca `packages/core`, el motor, ni la RLS existente.
- No migra los pagos viejos (decisión de negocio pendiente).
- No borra la columna `salario_base` ni las rutas viejas.
- No toca Mi espacio del colaborador ni el resumen mensual del colaborador (F2+ del flujo
  maestro).
