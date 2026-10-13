# Frecuencia de pago flexible — plan de implementación

Spec: `docs/superpowers/specs/sueldos/2026-10-06-frecuencia-pago-flexible-design.md` (no se modifica
en este PR; si se encuentra un error en ella se reporta en el PR, no se afloja).
Zona crítica (cadena del sueldo): tests antes del código, commits separados, sin tocar
`liquidarPeriodo` ni la RPC `sueldo_entrada`.

## Decisiones de diseño

- **El motor no cambia.** La cuota vigente y el prorrateo se resuelven en el core con funciones
  puras y se inyectan en `entrada.sueldoPactado` desde `entradaDeAcuerdo()` (repo). La RPC
  `sueldo_entrada` (0098) sigue mandando `a.sueldo_pactado`; el repo lo reemplaza por la cuota del
  tramo. El snapshot `entrada` del borrador guarda la cuota usada, así que lo cerrado no se mueve.
- **Fechas:** el core no llama `new Date()`; sólo recibe strings `YYYY-MM-DD` (reusa `msDeFecha`).
- **Ancla:** cada frecuencia vigente tiene una fecha ancla (`desde` de la fila de cambios, o
  `fecha_inicio` del contrato). Quincenal se corta sobre esa ancla; semanal y «cada N días» siguen
  cortando desde el inicio del tramo (idéntico a hoy para semanal).
- **Defaults inventados (regla 5):** quincena anclada al día de inicio; último pago corto se
  prorratea por días; cada N días con 1 ≤ N ≤ 62. Comentados en migración y código, anotados en
  `docs/pendientes-negocio.md`.

## Tareas (un commit por tarea)

1. **Plan** (este archivo).
2. **Tests rojos en core** (`sueldos.test.ts`): los 6 casos de la spec §7.
3. **Core** (`sueldos.ts`): `ModalidadPago` ampliado, `FrecuenciaPago`, `finDePeriodo` generalizado,
   `cuotaDelTramo` (prorrateo), `calendarioDePagos`, `frecuenciaVigente`, `liquidacionesCruzadas`.
4. **Migración 0120** (idempotente): check de `modalidad`, `cada_dias`, tabla
   `sueldo_acuerdo_cambios` con RLS igual que `sueldo_acuerdos`, prueba SQL en `packages/db/pruebas`.
5. **Repo y actions**: leer/guardar `cada_dias`, `listarCambios`, `cambiarFrecuencia` (valida
   «desde» = próximo pago sin pagar), `entradaDeAcuerdo` con cuota vigente. Sin `getAdminClient`.
6. **UI**: selector «Cómo se paga» con vista previa en el formulario del contrato; panel «Cambiar
   cómo se paga» y línea de cambios en la ficha; `sugerirRango` usa la frecuencia vigente.
7. **Docs** (`pendientes-negocio.md`, `INDEX.md`) y verificación con el subagente `verificador`.
