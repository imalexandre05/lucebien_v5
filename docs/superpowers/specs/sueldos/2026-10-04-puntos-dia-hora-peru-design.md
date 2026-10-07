# SPEC — Los puntos se asignan al día y al mes de Perú, no al de UTC

> **Zona de rigor:** spec completa. Toca la cadena del sueldo (no-negociable 1) y la regla de
> fechas (no-negociable 4). Ticket: imalexandre05/lucebien-tablero#37.

## 1. Problema (verificado contra el código)

`packages/db/migrations/0095_puntos_como_moneda.sql:179` filtra los puntos del pipeline con

```sql
from pipeline_puntos where empleado_id = p_empleado and fecha::date between p_desde and p_hasta
```

`pipeline_puntos.fecha` es `timestamptz` y la base corre en UTC. `fecha::date` toma el día UTC, así
que todo lo trabajado después de las 19:00 hora Perú cae en el día siguiente, y lo trabajado el
último día del mes después de las 19:00 cae en el mes siguiente. Quien cierra el mes trabajando de
tarde-noche pierde esos puntos de su evaluación y de su pago.

## 2. Regla

**Todo agrupamiento o filtro por día o mes de un `timestamptz` que alimente puntos, notas o pago se
hace en hora Perú:** `(col at time zone 'America/Lima')::date`.

## 3. Alcance

- La ÚLTIMA definición vigente de cada función que haga ese patrón sobre una columna `timestamptz`.
  El inventario verificado va en el plan (`docs/superpowers/plans/2026-10-04-puntos-dia-hora-peru.md`).
- `apps/erp-web/lib/pipeline-repo.ts` (`movimientosRecientes`, métricas por día).
- Las columnas de tipo `date` ya están bien: no se tocan.

## 4. Qué NO cambia

Ningún cálculo, ningún peso, ninguna fórmula. Sólo el día al que se asigna cada punto.

## 5. Fuera de alcance

Recalcular evaluaciones ya cerradas. Las guardadas no se recalculan (0095, `metodo`); queda anotado
como pendiente en `docs/pendientes-negocio.md`.

## 6. Cómo se comprueba

- Un punto con `fecha = '2026-09-30 23:30-05'` cuenta en septiembre y no en octubre.
- Un punto con `fecha = '2026-10-01 00:30-05'` cuenta en octubre.
- Prueba SQL en `packages/db/pruebas/` y prueba vitest para el helper del repo TS.
