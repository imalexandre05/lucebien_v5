# SPEC — «Personal»: la fusión de todo lo de personas en un solo apartado

> **Qué es.** Cinco entradas del menú —Colaboradores, Sueldos, Liquidaciones, Empleados,
> Evaluaciones— se vuelven una: **Personal**. Se entra por la persona y adentro está todo su
> flujo en orden; lo masivo (asistencia del día, ventas, liquidar el mes) queda como
> «Herramientas del periodo» dentro del mismo apartado. Sale de la prueba real de Alexander
> (22/23-ago): la navegación híbrida de la spec maestra del 21-ago no se entiende usándola.
>
> **Estado:** aprobada por Alexander el 23-ago-2026, decisión por decisión (5 preguntas).
> **Zona de rigor:** R1–R3 spec corta (navegación y pantallas, cero esquema). **R4 zona
> crítica** (pagos de liquidaciones: migración + RPC + verificador).
>
> Esta spec **reemplaza** la sección de navegación de la spec maestra
> [2026-08-21-sueldos-flujo-maestro-design.md](2026-08-21-sueldos-flujo-maestro-design.md) §3:
> el híbrido «por proceso / por persona» como dos entradas separadas queda superado por la
> evidencia de uso. Lo construido en F1 no se tira: se **recoloca** dentro de Personal.

---

## 1. Las decisiones (Alexander, 23-ago-2026)

| Pregunta | Decisión |
|---|---|
| Forma del apartado | **Se entra por la persona y adentro está todo**, como el módulo del sistema viejo que entendía perfecto. Lo por-proceso queda como herramientas internas |
| El sueldo en dos lugares (`salario_base` de la ficha vs `sueldo_pactado` del contrato) | **Manda solo el contrato.** El campo editable de la ficha desaparece; muestra el sueldo del contrato vigente en solo lectura, con enlace al contrato. La columna en la base no se borra |
| Alta de una persona nueva | **Flujo encadenado**: datos → contrato → horario, de corrido y sin salir. Interrumpible: queda «sin contrato» y la lista lo marca |
| Pagos vs Liquidaciones | **La liquidación ES el pago.** Sobre la liquidación cerrada se registran pagos/abonos (fecha, monto, método) hasta saldarla; muestra el saldo pendiente. La sección Pagos sale del menú |
| Evaluaciones | **Entra a Personal** — es un paso más de la cadena de la persona |
| Nombre de la entrada | **Personal** |

## 2. La estructura

### 2.1 El menú

En Administración queda **una** entrada: `Personal` → `/personal`. Salen del menú: Colaboradores,
Sueldos, Liquidaciones, Empleados (y Evaluaciones si aún figurara). Permiso de la entrada: el
mismo mecanismo actual de Colaboradores (`evaluaciones` con alternos `pagos`/`sueldos` —
`modulosAlternos`), para que ningún rol pierda el acceso que tenía. **Cada pantalla interna
conserva exactamente su permiso actual** (no-negociable 3: unificar navegación no amplía lo que
nadie ve).

Las rutas viejas **redirigen**: `/colaboradores` y `/colaboradores/[id]/*` → `/personal/...`,
`/empleados` → `/personal` (la gestión vive en la pestaña Datos), `/sueldos` (hub) →
`/personal`. Las pantallas de herramientas (`/sueldos/asistencia`, `/sueldos/ventas`,
`/sueldos/movimientos`, `/sueldos/acuerdos`, `/sueldos/liquidaciones`, `/evaluaciones`) siguen
respondiendo en su URL — lo que cambia es desde dónde se llega.

### 2.2 `/personal` — la portada

Dos zonas:

1. **Herramientas del periodo** (fila compacta arriba): Declarar asistencia · Ventas y metas ·
   Adelantos y descuentos · Liquidar el periodo · Evaluaciones del mes · Contratos (la lista
   general). Enlaces a las pantallas existentes — no se reescriben.
2. **La lista de personas** (el cuerpo): la lista actual de `/colaboradores` con su hilo, su
   filtro de pendientes y su búsqueda, más un botón **«Nueva persona»** (R2) y el marcado
   «sin contrato» en ámbar.

### 2.3 El expediente — `/personal/[id]`

Las pestañas en el orden del flujo real:

```
Datos → Contrato → Asistencias → Movimientos → Evaluación → Liquidación y pago → Valores 360°
```

- **Datos** (nueva): la ficha que hoy vive en `/empleados` (nombre, rol, sede, acceso…),
  editable acá con su mismo permiso actual (`empleados`). El sueldo aparece en solo lectura
  desde el contrato vigente (R3). El Resumen actual de la persona (el hilo y «qué falta») se
  integra arriba de Datos o queda como cabecera — no desaparece.
- **Liquidación y pago** (nueva): las liquidaciones de ESTA persona (filtro por empleado de la
  lista existente) y, en cada cerrada, sus pagos/abonos y el saldo (R4). Reemplaza a la pestaña
  «Pago» actual (los pagos sueltos históricos se siguen viendo ahí hasta R4; ver §4).
- Las demás pestañas ya existen y no cambian de contenido.

### 2.4 Alta encadenada (R2)

`Nueva persona` → paso 1 datos (el formulario de alta de empleados actual) → al guardar sigue
solo al paso 2 contrato+horario (el editor de contrato existente, con `personaFija` — F1.5) →
al pactar, listo: expediente abierto. Interrumpido en el paso 1: la persona queda creada «sin
contrato», la lista la marca en ámbar con acceso directo al paso 2. No hay estado nuevo en la
base: «sin contrato» = no tiene acuerdo, que ya es consultable.

### 2.5 Sueldo único (R3)

En la pestaña Datos, el campo editable de salario desaparece. En su lugar: «Sueldo (del
contrato vigente): S/ X · ver contrato», o «Sin contrato — pactarlo» si no tiene. La columna
`salario_base` de la base **no se toca** (el sistema viejo y quién sabe qué más la leen);
sólo deja de mostrarse y editarse en el ERP nuevo. Se anota en `docs/pendientes-negocio.md` que
la columna quedó huérfana de UI, para decidir su retiro con calma.

**Quién más la consume hoy** (mapa del 23-ago): la fórmula `sugerirMontoPago(salarioBase, …)`
de `packages/core/src/pagos.ts:12` alimenta la sugerencia del panel de pagos viejo y de
evaluaciones. **No se toca**: esos consumidores quedan congelados con el valor que la columna
tenga (el módulo viejo de pagos desaparece del menú en R4). El alta de empleados nunca capturó
el salario (`NuevoEmpleadoInput` no lo tiene) — un nuevo entra con 0 hasta hoy, lo que refuerza
que el único lugar real del sueldo es el contrato.

### 2.6 La liquidación es el pago (R4 — zona crítica)

Sobre una liquidación **cerrada** se registran pagos:

| Campo | Qué |
|---|---|
| `liquidacion_id` | La liquidación que salda |
| `fecha` | Cuándo se pagó |
| `monto` | > 0. La suma de pagos no puede superar el total de la liquidación |
| `metodo` | Efectivo · Yape · Plin · Transferencia · Otro (catálogo editable en configuración) |
| `nota` | Opcional |
| `registrado_por` | Quién |

Reglas:
- Solo sobre liquidación `cerrada` (un borrador todavía cambia; una anulada no se paga).
- La pantalla muestra: total · pagado · **saldo**. Saldada = badge «pagada».
- Un pago se puede **anular con motivo** (nunca editar ni borrar en silencio — mismo criterio
  que la liquidación).
- Escritura por RPC con las validaciones arriba; RLS: el colaborador ve sólo los pagos de sus
  propias liquidaciones, admin/dueño todo (aislamiento 1).
- Los **adelantos NO son pagos de la liquidación**: ya entran como descuento dentro del cálculo
  (RN-19). Acá se registra lo pagado del TOTAL ya calculado. La pantalla lo aclara para que
  nadie registre el adelanto dos veces.
- **Una liquidación con pagos vigentes no se anula** (regla agregada el 23-ago-2026 tras el
  verificador, hallazgo 1). Si se anulara, los pagos quedarían colgados de una liquidación
  anulada y la reemisión arrancaría con pagado = 0: el camino directo a pagar dos veces el mismo
  mes. Para anular una liquidación con pagos hay que **anular antes cada pago con su motivo** —
  así el rastro de por qué ese dinero ya no cuenta queda escrito, nunca implícito. Lo impone la
  base (trigger sobre `sueldo_liquidaciones`), con un mensaje que dice cuántos pagos y por
  cuánto. Trasladar pagos a una reemisión queda fuera: es más diseño y nadie lo pidió.
  ⚠️ Default de seguridad tomado por Alexander vía el agente, pendiente de confirmar con el
  dueño; anotado en `pendientes-negocio.md`.
- **La regla del saldo vive en la base, no solo en la RPC**: el trigger de la tabla de pagos
  también rechaza un INSERT directo que supere el total (bloqueando la fila de la liquidación
  antes de sumar, mismo lock que la RPC). Un administrador que escriba por PostgREST o SQL
  crudo tampoco puede pagar de más ni colar un `NaN`. `registrado_por` obligatorio por la misma
  vía. El monto se redondea a 2 decimales antes de validarse, para que lo validado sea
  exactamente lo guardado.
- Una liquidación con `total ≤ 0` (descuentos ≥ ingresos) no admite pagos y **no se muestra
  como «pagada»**: la pantalla la marca «sin monto a pagar». «Pagada» exige `total > 0` y saldo
  0.
- `metodo` se acepta como texto libre (editar el catálogo no invalida la historia); `fecha` sin
  cota. Ambas anotadas en `pendientes-negocio.md` como decisión de negocio abierta.
- Migración nueva (reservar número), idempotente, con su archivo de prueba en
  `packages/db/pruebas/` que intente: pagar un borrador, pagar de más, editar un pago, borrar
  un pago, pagar una anulada — todo debe fallar.
- **Verificador antes de mergear** (no-negociable 1: esto le paga a gente real).

### 2.7 Qué pasa con los pagos sueltos viejos (módulo `/pagos`)

No se migran ni se borran: quedan visibles como «Pagos registrados antes del sistema de
liquidaciones» en la pestaña Liquidación y pago (solo lectura, colapsados). `/pagos` sale del
menú pero la ruta sigue viva. La decisión de migrarlos o archivarlos es de negocio y queda
anotada en `pendientes-negocio.md`. Dato: `pagos.evaluacion_id` apunta a
`evaluaciones_mensuales` — los pagos viejos son cierres de evaluación, un sistema aparte del
motor; nunca hubo FK hacia `sueldo_liquidaciones`.

**Bug encontrado al mapear (23-ago), se corrige en R1 por ser mentira sobre dinero:** la
pantalla de Pagos pregunta «¿Anular este pago?» y promete que «se conserva a la vista, marcado
como anulado» (`app/pagos/cliente.tsx:119-135`), pero `eliminarPago()`
(`lib/pagos-repo.ts:199-203`) hace un **DELETE real** — el pago desaparece sin rastro, y la
columna `anulado` que la UI lee no la escribe nadie. Corrección mínima en R1: la acción pasa a
marcar `anulado = true` (update) en vez de borrar, que es lo que la UI ya promete y muestra.
Sin migración: la columna existe desde la 0001.

## 3. Fases

| Fase | Qué | Esquema |
|---|---|---|
| **R1** | Menú (5→1) + `/personal` (portada: herramientas + lista) + expediente con pestaña Datos + redirects | No |
| **R2** | Alta encadenada datos→contrato→horario | No |
| **R3** | Sueldo único (ficha muestra el del contrato, campo editable fuera) | No |
| **R4** | Pagos de liquidación (migración + RPC + pantalla + verificador) | **Sí** |

Cada fase: su tanda de tareas con revisor, y al cierre de R1–R3 y de R4 un **validador de
flujo** (§5).

## 4. Lo que NO cambia

- El motor de cálculo (`packages/core`) — nada.
- Permisos y RLS por pantalla — cada una conserva el suyo.
- Las pantallas de herramientas — se llega distinto, son las mismas.
- Mi espacio / mi-desempeño del colaborador — fuera de alcance acá.
- La columna `salario_base` en la base — queda, sin UI.

## 5. Validación de flujo (pedida por Alexander: «en loop, comprendiendo cómo se trabaja»)

Al cerrar cada fase, agentes validadores recorren el código **como si fueran la empresa**:

1. **Lunes, empleado nuevo**: el admin registra a alguien que empieza hoy — datos, contrato,
   horario, primer día de asistencia. ¿El camino existe sin callejones? ¿Cuántos clics?
2. **Fin de mes, cierre y pago**: asistencias completas → ventas cargadas → nota → liquidar →
   cerrar → pagar (completo y en dos abonos). ¿Cada paso lleva al siguiente? ¿El adelanto de
   mitad de mes aparece descontado y NO se puede volver a registrar como pago?
3. **El colaborador pregunta «cuánto cobro y por qué»**: desde el expediente, ¿el admin puede
   responder con el desglose en ≤2 clics?

Cada validador reporta fricciones con archivo:línea; lo que sea rotura se corrige en la misma
fase, lo que sea mejora queda anotado.

## 6. Pendientes que deja

| Qué | Dónde queda |
|---|---|
| Retirar la columna `salario_base` de la base | `pendientes-negocio.md`, decisión con calma |
| Migrar o archivar los pagos sueltos viejos | `pendientes-negocio.md`, decisión de negocio |
| Catálogo de métodos de pago (defaults propuestos: Efectivo/Yape/Plin/Transferencia/Otro) | Editable en `/configuracion`; confirmar con el dueño si falta alguno |
