# SPEC — Ingreso de personal: entrevistados y prueba de 3 días

> **Estado: borrador para aprobar.** No hay código ni migración todavía (Zone Guard: la spec va
> sola, el código en un commit posterior).
>
> **Origen.** Apuntes del cliente del 9-sep-2026 («FALTA AGREGAR EL APARTADO DE ENTREVISTADOS
> NUEVOS… con tres estados bueno, regular y malo», y en la tabla *Procesos de registro de personal*:
> «Entrevista — FALTA», «Prueba (3 días) — resultado — FALTA»). Ticket del tablero: ticket 14 de
> `lucebien-tablero`.
>
> **Rigor.** El ticket dice «spec corta». Eso vale para la pantalla y el flujo, pero la tabla nueva
> guarda datos personales (DNI, teléfono) con RLS: por el cuadro de `CLAUDE.md` («esquema de base,
> permisos, aislamiento») la **migración exige spec completa: prueba SQL y verificador antes de
> aplicar**. Esta spec cubre las dos cosas.

## 1. Qué hay hoy y qué falta

Verificado en el código de `release/2026-10-07`:

- **Existe:** el alta (`app/personal/nuevo`, `accionCrearEmpleado`: nombre, rol, sede, tiendas,
  fecha de ingreso, notas, contraseña inicial), documentos adjuntos (0105) y contratos
  (`sueldos/acuerdos`).
- **No existe:** nada anterior al alta. Una persona sólo entra al sistema cuando ya es colaborador.

## 2. Alcance

**Entra:** una etapa previa al alta — candidato → entrevista → prueba de 3 días con resultado →
pasa a alta con sus datos ya cargados.

**No entra** (otros tickets): capacitación y exámenes (tickets 12 y 13), pago de la prueba,
asistencia durante la prueba.

## 3. Modelo: una sola tabla, `candidatos`

| Columna | Detalle |
|---|---|
| `id` | uuid |
| `nombre`, `dni`, `telefono` | datos de contacto; `nombre` obligatorio |
| `rol_cod`, `sede_cod` | a qué puesto y sede postula (referencias a `roles` y `sedes`) |
| `estado` | `por_entrevistar` · `entrevistado` · `en_prueba` · `prueba_cerrada` · `contratado` · `descartado` |
| `entrevista_fecha`, `entrevista_obs` | cuándo y qué se observó |
| `prueba_desde`, `prueba_hasta` | `hasta` = `desde` + (días de prueba − 1), calculado al iniciar |
| `resultado` | `bueno` · `regular` · `malo` (los tres estados que pidió el cliente); vacío hasta cerrar la prueba |
| `resultado_obs` | observación de quien evaluó |
| `empleado_id` | se llena al pasar a alta; `on delete restrict` |
| `creado_por`, `creado_en` | del servidor, nunca del cliente |

Sin tabla por día: el cliente pide **un resultado** para la prueba, no una nota por día.

## 4. Flujo

1. **Registrar candidato** (estado `por_entrevistar`).
2. **Registrar entrevista** → `entrevistado`.
3. **Iniciar prueba** con fecha de inicio → `en_prueba`; la fecha de fin sale del parámetro de días.
4. **Cerrar prueba** con resultado y observación → `prueba_cerrada`. Sólo desde el día de fin en
   adelante, comparado con `hoyPeru()` (no-negociable 4: el core nunca llama `new Date()`).
5. **Pasar a alta** → abre `personal/nuevo` con el nombre y las notas precargados; al crear al
   colaborador se guarda `empleado_id` y el candidato pasa a `contratado`. El resultado «malo» no
   bloquea el alta: avisa, y decide el administrador.
6. **Descartar** desde cualquier estado previo a `contratado`, con motivo en `resultado_obs`.

Todo cambio de estado va **por RPC**, nunca un `update` plano (misma disciplina que el
no-negociable 2): la RPC valida que la transición exista y registra quién la hizo.

## 5. Permisos y aislamiento (no-negociable 3)

- **Sólo administrador y dueño** (`private.app_es_admin()`) leen, crean o cambian candidatos. Es un
  **default de esta spec**, no una decisión del cliente: son datos personales de gente que aún no
  es colaboradora. Ver §7.
- RLS activa; `revoke` general y `grant` de columnas sólo para las que el cliente puede fijar
  (patrón de 0070 y 0105). `anon` sin ejecución en las RPC.
- Trigger de auditoría (`private.audit_log_trigger`, como `empleado_documentos`).
- Ninguna lectura con `getAdminClient()`: pasa por RLS.

## 6. Parámetro editable (no-negociable 5)

`config('personal_prueba_dias') = 3`. El 3 es dato del cliente («Prueba (3 días)»); se deja en la
tabla `config`, editable desde `/configuracion`, y se anota en `docs/pendientes-negocio.md`. Nada
hardcodeado en la migración ni en la pantalla.

## 7. Preguntas para Alexander (con el default que se usará si no hay respuesta)

| Pregunta | Default |
|---|---|
| ¿Se paga la prueba de 3 días? | **No se calcula nada** en SCI-LB; se decide en el contrato |
| ¿Puede repetirse la prueba de alguien? | Sí: vuelve a `entrevistado` desde `prueba_cerrada` |
| ¿Un descartado se puede reactivar? | Sí, a `por_entrevistar`, con rastro en la auditoría |
| ¿Cuánto tiempo se guardan los datos de un descartado? | Sin borrado automático |
| ¿Quién evalúa la prueba: sólo el administrador, o también el encargado de sede? | Sólo administrador y dueño |

## 8. Qué debe probar la migración (antes de aplicar)

1. Un usuario que no es admin ni dueño no lee, no inserta ni cambia ninguna fila.
2. Cada transición inválida se rechaza (p. ej. cerrar una prueba que no se inició).
3. No se puede cerrar la prueba antes de su fecha de fin.
4. Pasar a alta vincula `empleado_id` y no admite un segundo alta con el mismo candidato.
5. `anon` no ejecuta ninguna RPC; el cliente no puede fijar `creado_por` ni `creado_en`.
6. Reaplicar la migración no falla (idempotente).

El número de migración se reserva con `bash tools/reservar-migracion.sh candidatos` al empezar el
código, no antes.

## 9. Fuera de esta spec, a propósito

Capacitación, exámenes y checklist (tickets 12 y 13) conectarán con `candidatos` más adelante, pero
no se diseñan aquí: «no diseñes para requisitos hipotéticos».
