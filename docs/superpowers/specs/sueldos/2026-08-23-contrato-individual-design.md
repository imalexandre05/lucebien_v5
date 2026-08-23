# SPEC — Pantalla de Contrato individual (mejoras de F1.5)

> **Qué es.** Cuatro mejoras a la pantalla de contrato de un colaborador, salidas de la primera
> prueba real de Alexander sobre el ERP (22-ago-2026, con capturas). Todas son de presentación:
> ninguna toca `packages/core`, ninguna escribe una migración, ninguna cambia un cálculo de pago.
>
> **Estado:** construida el 23-ago-2026 (C-1 a C-4, commits `1c39096`..`a947bb0`, cada tarea con
> revisión propia en verde). Pendientes de §4 sin cambios. Nota que dejó la revisión de C-4: si
> algún día `horasMinimasAlmuerzo` se configura en 0, el techo de almuerzos contaría también los
> días sin horario (`0 >= 0`) — corregirlo pasa primero por esta spec (Zone Guard).
>
> Diseño aprobado por Alexander el 23-ago-2026, con mockup comparativo de tres layouts para el
> horario — eligió B.
>
> **Zona de rigor:** spec corta. Pantalla existente, sin campo de negocio nuevo, sin motor.

---

## 0. Contexto: qué pantalla es y quién la comparte

`/colaboradores/[id]/contrato` muestra y edita el acuerdo de sueldo de UNA persona. No tiene UI
propia: renderiza `AcuerdosCliente` (`apps/erp-web/app/sueldos/acuerdos/cliente.tsx`, ~650
líneas), el mismo componente que usa `/sueldos/acuerdos` para TODAS las personas. Esa
reutilización es deliberada (spec del módulo de colaboradores, §5: dos copias serían dos verdades)
y esta spec la conserva: los cambios van al componente compartido, con un prop nuevo para
distinguir los dos contextos.

## 1. Los cuatro cambios

### C-1 — El selector "Persona" desaparece cuando la persona ya está fija

**Reporte textual:** «Porque si estoy en el contrato de Marilyn me aparece "persona". ¿Qué es esa
sección?»

Hoy el editor muestra siempre `<LabelGrupo>Persona</LabelGrupo>` + `PersonaPicker` con buscador
(`acuerdos/cliente.tsx:310-317`), aunque `/colaboradores/[id]/contrato` pase un array de una sola
persona. Un buscador para elegir entre uno se lee como un error.

**Cambio:** `AcuerdosCliente` acepta un prop opcional `personaFija?: Emp`.

- Con `personaFija`: no se renderiza el picker; en su lugar, una línea fija «Contrato de
  {nombre}». El borrador se inicializa con `empleadoId = personaFija.id` y no puede cambiarse.
  La columna «Persona» de la tabla de contratos tampoco se renderiza (repetiría el mismo nombre
  en cada fila).
- Sin el prop (caso `/sueldos/acuerdos`): todo exactamente como hoy.

Quién lo pasa: sólo `/colaboradores/[id]/contrato/page.tsx`, que ya tiene a `persona` cargada.

### C-2 — La fecha de inicio se precompleta con la fecha de ingreso, sólo en el primer contrato

**Reporte textual:** «debería conectarse la fecha de inicio del contrato con la fecha de ingreso
me parece, así todo va parejo».

**Decisión (Alexander, 23-ago-2026): autocompletar sólo el primer contrato.** Al abrir «Nuevo
contrato» para una persona que no tiene NINGÚN contrato previo (`acuerdos.length === 0`),
`fechaInicio` arranca con la fecha de ingreso de la persona, editable. Las renovaciones arrancan
vacías: una renovación tiene su propia fecha y atarla a la fecha de ingreso original la pisaría.

Dato necesario: la fecha de ingreso ya existe en `empleados` y `obtenerColaborador()` la trae
(campo `fechaIngreso: string | null` — `colaboradores-repo.ts:25`). Se pasa junto con
`personaFija`. Si es `null`, no se precompleta nada. En `/sueldos/acuerdos` (sin persona fija) el
precompletado NO aplica: al abrir el editor todavía no se sabe de quién será el contrato.

### C-3 — El editor de horario: fila por día con barra visual y atajos (layout B)

**Reporte textual:** «La forma de hacer los horarios es medio complicada, podría funcionar como
un calendar, solo arreglemos la manera de ingresar los datos (frontend) y la experiencia de
usuario».

**Decisión (mockup comparativo, 23-ago-2026): layout B** — se mantiene la fila por día (nada que
reaprender, mismo modelo de datos `turnos[]`), y se agrega:

1. **Barra visual por día**: una barra horizontal de 06:00 a 22:00 donde cada turno del día se
   pinta como un segmento dorado. Se lee el patrón de la semana de un vistazo y un hueco entre
   turnos se VE, complementando el aviso textual que ya existe.
2. **Botones de turno rápido** por día: «Mañana 09–13» y «Tarde 13–20» agregan ese turno con la
   hora ya puesta (los dos horarios reales de LuceBien, hoy escritos a mano cada vez). Editables
   después como cualquier turno.
3. **Copiar día**: un botón por día con turnos que copia sus turnos a los días siguientes que
   estén vacíos (ej. cargar lunes y copiarlo a martes y miércoles en un click — el caso real:
   Lun–Mié idénticos). No pisa días que ya tienen turnos.

La grilla tipo calendario (layout A) NO se construye acá: quedó elegida como dirección para el
**horario general de tienda** (§3), que es otro subproyecto.

Los valores de los botones rápidos salen de lo que ya está escrito en la pantalla («El horario
real de LuceBien es 09:00–13:00 y 13:00–20:00») como constantes locales de UI — no son una regla
de negocio: son atajos de tipeo, el admin puede escribir cualquier otra hora.

### C-4 — La vista previa pasa a llamarse «Resumen del contrato» y dice más

**Reporte textual:** «agrega también pago mensual, está el pago total por todos los meses;
también agregarías las horas mensuales de trabajo y todo ello, no solo el total. Y ponle un
nombre a esa sección. También debe agregarse lo que ganará mensualmente o en total por
almuerzos».

La tarjeta actual (sin título, `acuerdos/cliente.tsx:444-469`) muestra: Días del periodo · Horas
contratadas · Valor de la hora · Sugerido por escala. Pasa a titularse **«Resumen del contrato»**
y suma estas celdas:

| Campo | Cálculo | Nota |
|---|---|---|
| Pago del periodo | `sueldo_pactado` (el input, reflejado) | Para que el total y el mensual queden juntos |
| Pago mensual (aprox.) | `sueldo_pactado / (dias_periodo / 30)` | **Decisión: aproximado siempre** (Alexander, 23-ago). Mismo espíritu que RN-04: referencia informativa, jamás decide un pago |
| Horas mensuales (aprox.) | `horas_contratadas / (dias_periodo / 30)` | Ídem |
| Almuerzos — máx. del periodo | `dias_con_horario_completo × valor_almuerzo` | `dias_con_horario_completo` = fechas del periodo cuyas horas contratadas del día ≥ `horas_minimas_almuerzo`; si el contrato tiene `almuerzoHabilitado`, TODOS los días con horario cuentan. Parámetros: los del acuerdo con default global (12 h · S/8), como el resto |
| Almuerzos — máx. mensual (aprox.) | el anterior `/ (dias_periodo / 30)` | Ídem |

**El techo, no la promesa.** El monto de almuerzos real depende de la asistencia (RN-15 mira lo
efectivamente trabajado). La tarjeta lo dice en una línea: «Almuerzos: máximo si cumple el
horario todos los días; lo real sale de la asistencia». Sin esa aclaración, el número se leería
como pactado — el mismo cuidado que ya tiene «Sugerido por escala».

Todo vive en `analizar()` (la función local de presentación del componente, que ya reutiliza
`resumirHorario`/`diasDelPeriodo`/`sueldoSugerido` del core). Nada nuevo entra a
`packages/core`: son divisiones y multiplicaciones de presentación sobre números que el core ya
dio. Los parámetros de almuerzo se leen con la misma precedencia que usará la liquidación
(override del acuerdo → default), para que el techo mostrado no contradiga lo que el motor
después pague.

## 2. Lo que esta spec NO hace

- **No** toca `packages/core` ni migraciones.
- **No** cambia cuándo ni cuánto se paga: sólo qué se ve al pactar.
- **No** construye el calendario drag-and-drop (layout A).
- **No** toca el ciclo de pago (`calcularCiclo()`): el «pago mensual» de C-4 es una división de
  referencia, no una fecha de pago.
- **No** resuelve el error transitorio «solo el admin puede hacer los contratos»: se investigó
  (23-ago) y no es un bug de lógica — página y acciones usan el criterio idéntico
  (`rol === 'admin' || 'dueno'`); la hipótesis es una carrera de renovación de token de Supabase
  en el middleware. Queda anotado abajo, a la espera de reproducción.

## 3. Subproyecto futuro que esta conversación abrió: horario general de tienda

Alexander mostró el horario físico real (imagen, 23-ago): un tablero por sede — TIENDA LUCE BIEN,
STAND 101-102, TRECE, ALMACÉN, más filas administrativas — con turno mañana/tarde como filas,
días como columnas, y hasta 5 personas por turno, cada una con una **función** (Caja, Ventas 1,
Encargado, B, Costura), coloreadas por persona.

**Decisión ya tomada (23-ago): sale de los MISMOS datos que los contratos** — una sola fuente de
verdad; si cambia el contrato de alguien, el tablero se actualiza solo. Lo que exige y por qué es
zona crítica:

- `sueldo_acuerdo_turnos.lugar` existe desde la 0072 (`text`, informativo) pero la UI nunca lo
  expone. Habría que volverlo real (ligado a `sedes`) y agregar un campo **rol/función del
  turno** — migración sobre una tabla que alimenta RN-01 (horas contratadas → valor hora → todo).
- Definir si el tablero es sólo lectura (se edita persona por persona) o de edición directa
  (arrastrar a alguien de un turno a otro edita su contrato) — decisión de negocio con
  consecuencias de pago.
- El layout elegido como dirección es la grilla tipo calendario (A del mockup del 23-ago).

Exige spec completa propia + verificador (no-negociable 1). No se empieza sin cerrarla.

## 4. Pendientes que deja

| Qué | Estado |
|---|---|
| Error transitorio «solo el admin» | Sin reproducir. Si vuelve a pasar: anotar hora exacta y qué pantalla, y mirar los logs del middleware de esa request |
| Horario general de tienda | §3 — spec propia antes de tocar nada |
