# SPEC — Temporadas: pago por hora y metas (ticket 15)

> Zona crítica (metas → bono → pago): spec completa + tests + verificador. Spec, tests y código en
> commits separados (Zone Guard). Migración 0133.

## Decisión del dueño (confirmada)
El administrador (Jordan) **crea las temporadas** (nombre, desde, hasta) y edita para cada una el
**pago por hora** y las **metas**. **Sin temporadas inventadas:** si no hay ninguna, o ninguna cubre
la fecha, se usa el valor normal (comportamiento de hoy, sin cambio alguno).

## Modelo
Tabla `temporadas`: `nombre`, `desde`, `hasta` (inclusivos, `hasta >= desde`), y tres valores
**opcionales** — `pago_por_hora`, `meta_semanal`, `meta_por_hora` (vacío = «no cambia, usa el normal»).
Las temporadas **no se solapan** (una fecha tiene a lo sumo una).

## Regla del motor (pura, sin `new Date()`)
`temporadaVigente(temporadas, fecha)` → la temporada que cubre `fecha` o `null`.
El motor la evalúa **por semana de liquidación**, con la fecha de inicio de cada tramo semanal:
1. **Meta pactada en el contrato** (`metaSemanal != null`) **gana siempre** (RN-10: «manda lo
   pactado»). La temporada no la toca.
2. Sin meta pactada: `meta = temporada.metaSemanal` si existe; si no,
   `horas × (temporada.metaPorHora ?? metaPorHora normal) × factorMeta`.
3. Fuera de toda temporada: fórmula de hoy, idéntica.
Cada semana lleva su propia meta; la del mes sigue siendo la suma de las semanales (RN-11).

## Pago por hora
La temporada define el **pago por hora de referencia**. Como el sueldo se **pacta** (cuota fija del
contrato, `valorPorHora = pactado / horas`), el motor **no reescribe lo pactado**: el pago por hora de
temporada alimenta el **sueldo sugerido** del contrato (`sueldoSugerido`, igual que las escalas) y
se muestra al armar el contrato. *Decisión por confirmar con el dueño:* si el pago por hora de
temporada debe, además, cambiar lo ya pactado.
`MOTOR_VERSION` sube (cambia una regla de cálculo de la meta).

## Datos y permisos
- Lectura: todo usuario activo (son parámetros de la empresa, no datos de una persona; la meta que
  ve un colaborador ya es la suya). **Pendiente de confirmar** si `pago_por_hora` debe ser sólo admin.
- Escritura: sólo administrador/dueño, **por RPC** (`temporada_guardar`, `temporada_eliminar`).
  Sin escritura directa; solape y fechas validados en la RPC; auditoría con el trigger común.

## Pruebas que deben existir
Core: sin temporadas = resultado idéntico al de hoy; semana en temporada con `metaSemanal` / con
`metaPorHora`; meta pactada gana; semanas de un mismo mes en dos temporadas distintas; bordes
inclusivos `desde`/`hasta`; temporada sin metas no cambia nada.
SQL (`0133`): no-admin no escribe; solape rechazado; `hasta < desde` rechazado; valores negativos
rechazados; lectura autenticada; reaplicar no falla.
