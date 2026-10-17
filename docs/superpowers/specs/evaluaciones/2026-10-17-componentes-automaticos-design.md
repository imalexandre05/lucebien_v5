# Spec 0132 — Evaluación: los componentes se calculan solos al abrir

> Escrita el 17-oct-2026, **antes** del código y de las pruebas (Zone Guard). Ticket:
> lucebien-tablero#3. Zona crítica (evaluación → nota → pago): spec completa, tests y verificador.
> Depende de la 0131 (capacitación), de donde sale la nota de examen.

## Qué ya existe (no se reescribe)
`private.evaluacion_componentes_datos` (0110) ya calcula **solo** operaciones, software, limpieza,
puntualidad (huella vs. horario, tolerancia de sueldos), descuentos por incidencias, Valores 360° y
los puntos del período. Al guardar, `armarEvaluacionAGuardar` ya toma todo eso de la RPC y **nunca**
del cliente (spec evaluacion-guardar-recalculada). La nota final sale de `puntosTotal`; los siete
componentes son perfil y no pesan en la nota.

## Qué falta (lo que cubre esta spec)
1. **`examenes` no tenía fuente.** Pasa a calcularse: promedio, sobre las capacitaciones
   *completadas* de la persona (como nueva) con cierre dentro del ciclo, de la **nota vigente** de
   cada una (la del último examen). Escala /20, redondeo a 2 decimales. Sin ninguna capacitación
   cerrada en el ciclo → `null`: el componente sigue siendo manual, como hoy.
2. **El cálculo era un botón.** Pasa a correr solo al elegir la persona y al cambiar el ciclo; el
   botón queda como «Recalcular». Mientras no haya cálculo, la pantalla dice «Calculando…» y no deja
   guardar (ya no puede haber una evaluación sin cálculo por olvido del botón).
3. **¿Se pueden pisar a mano los valores calculados? No.** Ya era así en el servidor; ahora la
   pantalla lo dice (campos bloqueados con la leyenda «calculado desde la data»). La única entrada
   manual es `examenes` cuando la RPC devuelve `null`, y las competencias (juicio humano).

## Cambios
- **Migración 0132:** `create or replace` de `private.evaluacion_componentes_datos` con el cuerpo
  EXACTO de la 0110 más dos claves: `examenes` (numérico o `null`) y `examenesCantidad` (cuántas
  capacitaciones cuentan). **No cambia ninguna otra clave ni `puntosTotal`.** Firma, `security
  definer`, search_path y permisos intactos (el portero `public.evaluacion_componentes` no se toca).
- **Core `armarEvaluacionAGuardar`:** si `data.examenes` es un número válido, se guarda ese valor y
  se **ignora** el del cliente; si es `null`/ausente, rige la entrada manual (0–20) como hoy.
- **Pantalla:** cálculo automático + campo `examenes` bloqueado cuando viene de la data.

## No cambia
Fórmulas, pesos, escala de puntos, `notaDesdePuntos`, el pago por puntos, evaluaciones ya cerradas
(no se recalculan), RLS. Sin parámetros de negocio nuevos.

## Pruebas
- Core: examenes de la RPC pisa al del cliente; `null` respeta la entrada manual; el resto de los
  componentes y la nota no cambian (casos existentes siguen verdes).
- SQL `0132_evaluacion_examenes.prueba.sql`: (1) sin capacitaciones → `examenes` null;
  (2) una completada con nota 16 en el ciclo → 16; (3) dos → promedio de sus notas vigentes;
  (4) una cerrada fuera del ciclo o cancelada/en curso no cuenta; (5) `puntosTotal` y las demás
  claves idénticas a las de la 0110 para la misma persona (comparación contra un caso sin examen).
