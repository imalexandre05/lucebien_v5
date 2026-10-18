# SPEC — Suspender a alguien cierra su contrato (issue #42, personal)

> **Zona de rigor:** nivel 3 (esquema, permisos y sueldos). Una migración (`0149`), dos RPC nuevas
> y un cambio a una RPC existente del huellero. No toca el motor de cálculo (`packages/core`).
>
> **Decisión del dueño, 05-oct-2026 (confirmada):** al suspender a alguien (renuncia, despido) su
> contrato vigente se **cierra en la fecha de suspensión** y el huellero **deja de marcarle faltas**.

## 1. Qué pasaba (verificado contra el código)

- `actualizarEstadoEmpleado()` (`lib/empleados-repo.ts`) sólo hace `update empleados set activo,
  estado` y banea el usuario en Auth. No mira `sueldo_acuerdos`.
- Resultado: la persona suspendida conserva un contrato con `fecha_fin` en el futuro.
  `huellero_declarar_faltas_del_dia` (0097) recorre `sueldo_acuerdos` por fecha, sin mirar
  `empleados.activo`, así que sigue declarándole **falta** cada día con turno. Cada falta descuenta
  dos días de sueldo en la próxima liquidación.
- `guardarTurnos()` (`lib/sueldos-repo.ts`) borra el horario y lo reinserta en dos llamadas
  separadas, sin transacción. Si el insert falla (solape, hora inválida), el contrato queda **sin
  horario**: `valor_por_hora = sueldo / 0`, nada que liquidar.

## 2. Reglas

### 2.1 Suspender cierra el contrato — RPC `empleado_suspender(p_id uuid, p_hoy date)`

Una sola transacción, `security definer`, sólo `private.app_es_admin()`:

1. `p_hoy` es obligatorio. **Lo pasa quien invoca** (`hoyPeru()` en la aplicación); la base no
   adivina la fecha.
2. No se suspende al último admin/dueño activo (misma regla y mismo mensaje que ya aplica el
   repositorio y que `empleado_actualizar` aplica desde la 0114).
3. Se marca `activo = false`, `estado = 'suspendido'`.
4. Se cierra el contrato que **cubre `p_hoy`** (`fecha_inicio <= p_hoy <= fecha_fin`): si
   `fecha_fin > p_hoy`, pasa a `fecha_fin = p_hoy`. Como `fecha_inicio <= p_hoy`, nunca queda
   `fin < inicio`, y achicar un rango no puede violar `sueldo_acuerdos_sin_solape`.
   - Contrato que ya terminó antes de `p_hoy`, o que termina hoy: no se toca.
   - Contrato que empieza **después** de `p_hoy`: no se toca (cerrarlo dejaría `fin < inicio`). Se
     informa como pregunta abierta (§6).
5. **Lo ya liquidado no se toca ni se invalida.** Si el contrato tiene una liquidación no anulada
   con `periodo_hasta > p_hoy` (se pagó por adelantado más allá de la baja), se corta con
   `ESTADO:` y un mensaje accionable: nombra la liquidación (periodo) y dice qué hacer («anúlala
   desde Liquidaciones, o suspende con fecha posterior al `periodo_hasta`»). No se escribe nada.
6. Los **cambios de frecuencia** (`sueldo_acuerdo_cambios`) con `desde > p_hoy` quedan fuera del
   contrato achicado (el trigger `sueldo_cambio_coherente` exige `desde <= fecha_fin`); se
   eliminan. Por el punto 5 no pueden haberse pagado.
7. Devuelve `jsonb` con `{contrato_cerrado: bool, fecha_fin_anterior, fecha_fin_nueva}` para que
   la pantalla lo diga.

**Orden en la aplicación:** primero se banea el acceso en Auth y después se llama a la RPC; si la
RPC falla (por ejemplo, el punto 5), se quita el baneo y no cambia nada. (Antes era al revés y el
rollback sólo deshacía la ficha.)

**Reactivar no reabre el contrato.** Reactivar sólo vuelve `activo = true`. El contrato queda
cerrado en la fecha de la baja; si la persona vuelve, el administrador pacta un contrato nuevo
(que puede empezar el día siguiente al cierre sin solape). Es deliberado: reabrir automáticamente
adivinaría un sueldo y un horario para un periodo que nadie pactó (no-negociable 5).

### 2.2 El huellero no declara faltas a quien está suspendido

`huellero_declarar_faltas_del_dia(p_fecha)` se redefine (mismo cuerpo que la 0097) con una
condición más al armar la lista: `empleados.activo`. Es la defensa para el contrato que pudiera
quedar abierto (futuro, o suspensión hecha a mano con SQL). No cambia nada más: freno, firma,
permisos y comentario de la 0097 se conservan.

### 2.3 Horario atómico — RPC `sueldo_acuerdo_guardar_turnos(p_acuerdo uuid, p_turnos jsonb)`

`security definer`, sólo admin, `search_path` fijo, `revoke` a `public`/`anon`, `grant` a
`authenticated`. En una transacción: valida que el acuerdo exista y que `p_turnos` sea un arreglo,
borra el horario y lo reinserta. Si cualquier fila falla (solape, hora fin <= inicio, día fuera de
1..7), **todo** se deshace y el horario anterior queda intacto. Los errores llevan prefijo `DATO:`
para que `errorSueldo()` los muestre tal cual. `guardarTurnos()` pasa a llamarla.

## 3. Personal: suspendidos aparte

`/personal`: los vigentes en primera plana; los suspendidos, en una sección plegable
«Suspendidos» **al final**, con contador (`tabular-nums`), cerrada por defecto, que respeta el
buscador. Se retira el filtro «Suspendidos» de la botonera (hacía lo mismo, escondido). Sigue
siendo la puerta de vuelta al expediente para reactivar o terminar de pagar.

## 4. Huecos de validación (sin reglas nuevas)

Sólo lo que hoy deja entrar a la base un dato que ella misma rechaza o que rompe el motor:

- Contrato (`validar()` en las acciones de `/sueldos/acuerdos`): fechas que no son `AAAA-MM-DD`
  reales; `diaSemana` que no sea entero de 1 a 7; hora que no sea `HH:MM`. Hoy llegan a Postgres
  y vuelven como error crudo o, peor, un `Invalid Date` en pantalla. Pasa a un módulo puro
  testeable. Mensajes en español neutral (los actuales tenían voseo).
- Documento (`subirDocumento`): la extensión del nombre se copia tal cual al `storage_path`; se
  sanea (`.ext` alfanumérica de hasta 8 caracteres, si no, sin extensión). Los mensajes con voseo
  pasan a español neutral. **No se cambia** que, si Storage falla, la fila de metadatos quede
  visible sin archivo: es una decisión escrita de la spec `documentos-adjuntos` §5 (señal visible,
  no rollback silencioso), no un hueco.

**No se endurece** que un contrato pueda guardarse sin horario o sin DNI/teléfono de la persona:
la spec `2026-09-08-contrato-datos-completos` decidió que lo faltante se ve como «—» y no bloquea;
es una regla de negocio ya tomada, no un hueco.

## 5. Cómo se prueba

- `packages/db/pruebas/0149_suspension_cierra_contrato.prueba.sql` (se descarta sola): cierra
  contrato vigente; no toca el ya terminado ni el futuro; liquidación posterior bloquea y no
  escribe nada; no-admin rechazado; último admin protegido; reactivar no reabre; el huellero no
  declara falta a un suspendido pero sí a un activo; el horario conserva el anterior si el nuevo
  solapa.
- `lib/__tests__/empleados-repo.suspender.test.ts`, `sueldos-repo.turnos.test.ts`,
  `acuerdo-validar.test.ts`, `documentos-repo.subir.test.ts` (extensión saneada).

## 6. Preguntas abiertas para el administrador

1. Un contrato **futuro** (empieza después de la baja) de una persona suspendida queda como está
   (el huellero ya no lo mira por `activo`). ¿Se prefiere que se elimine o se anule?
2. Fecha de la baja = **hoy** (hora Perú). Una baja con fecha retroactiva (“renunció el viernes”)
   no está contemplada; ¿se necesita elegir la fecha en la pantalla?
