# Plan — Pago por puntos sobre la meta mensual

Spec: `docs/superpowers/specs/sueldos/2026-10-05-pago-por-puntos-design.md` (zona crítica, ticket lucebien-tablero#10).
Todo lo de abajo se verificó contra el código el 05-oct-2026, no contra otro documento.

## 1. Lo que hay hoy (verificado)

| Pieza | Última definición | Qué importa para este cambio |
|---|---|---|
| `public.sueldo_entrada(uuid,date,date)` | `0098_liquidacion_muestra_horas_estimadas.sql` (reemplaza 0093) | Devuelve un `jsonb_build_object(...)` con `parametros = private.sueldo_parametros_config() \|\| a.parametros`. Ningún PR abierto la redefine (0110 toca `evaluacion_componentes_datos`; 0111 toca `sueldo_liquidacion_cerrar` y crea `sueldo_entrada_normalizada`). |
| `private.sueldo_parametros_config()` | `0078_tramos_asistencia_pausas.sql` (14 claves numéricas en el `mapa` + la booleana aparte) | «En blanco = no configurado»; basura corta con `CONFIG:`. Hay que sumar dos claves al `mapa`. |
| `sueldo_acuerdos_parametros_chk` | `0078` (16 claves) | Lista blanca del override por contrato. **No se amplía**: el congelado por contrato es #20 (ver §5 de la spec). |
| `private.evaluacion_componentes_datos(uuid,date,date)` | `0095_puntos_como_moneda.sql`; en el PR abierto `fix/puntos-hora-peru` pasa a la `0110` | Devuelve `puntosTotal` (pipeline + extras + actividades + ventas − incidencias). Se **llama**, no se reescribe: así toma la 0110 cuando entre, sin tocar nada. |
| `liquidarPeriodo` | `packages/core/src/sueldos.ts:587` | Las líneas son un arreglo literal (`lineas`, ~l. 975); el total sale de sumar por `grupo`. `resolverParametros` rechaza `null` salvo `metaSemanal`. |

## 2. Cómo se agrega una línea de ingreso

- **Motor:** una línea `{ grupo: 'ingreso', concepto: 'Bono por puntos', detalle, monto, regla }` empujada a `lineas`
  **sólo si** el pago está activo y el monto es > 0. `ingresos`/`subtotal`/`total` ya suman todo lo que sea `grupo: 'ingreso'`,
  así que no hay otro cambio de totales.
- **Comprobante y liquidación:** `Desglose` (liquidaciones/cliente.tsx) y el comprobante agrupan `lineas` por `grupo` de forma
  genérica; la línea nueva aparece sola. Las líneas se guardan al cerrar en `sueldo_liquidacion_lineas` con la misma forma.
  Lo único a revisar es que no se filtren líneas por una lista fija de conceptos.

## 3. Pasos (cada uno con `verificar-local.sh` verde antes del commit)

1. Este plan (sólo docs).
2. Reserva de la migración **0117** (`0110`–`0116` están tomados por PRs abiertos; confirmado con `git ls-remote` + `fetch --depth=1` de todas las ramas que ninguna tiene 0117). Commit y push solos.
3. Tests primero, en commit propio: vitest en core (casos 1–5 de §6) y prueba SQL `packages/db/pruebas/0117_*.prueba.sql` (parámetros vacíos no cambian nada; con parámetros, `sueldo_entrada` envía los puntos del rango). Caso 6 (cierre) depende del PR #44: se documenta, no se prueba aquí.
4. Migración idempotente: dos claves vacías en `config`, mapeadas en `sueldo_parametros_config`; `sueldo_entrada` agrega `puntosPeriodo` desde `evaluacion_componentes_datos`. El cuerpo de ambas funciones se copia de 0098/0078 sin otro cambio.
5. Core: parámetros `puntosMetaMensual` / `solesPorPunto` (`number | null`, default `null`), campo de entrada `puntosPeriodo`, línea con prorrateo por días, nunca negativo.
6. UI: tarjeta «Pago por puntos» en `/configuracion` (con promedio de 30 días), línea en liquidación/comprobante (automática), quitar «S/» de extras en `/evaluaciones` dejando los puntos, aviso en Mi desempeño sólo si está activo.
7. Documentación: `docs/pendientes-negocio.md` (prorrateo por días como default) y `docs/INDEX.md`.
8. Subagente `verificador` y corrección de lo que encuentre. Nada se aplica a ninguna base.

## 4. Decisiones que toma este plan

- **Puntos del período = lo que devuelve `evaluacion_componentes_datos` para el mismo rango**, viajan en la entrada como `puntosPeriodo` (cierre seguro, spec §3).
- **Meta prorrateada** para tramos que no son un mes: `meta × días_del_tramo / días_del_mes_en_que_empieza`, redondeo sólo al final. Default inventado → `pendientes-negocio.md`.
- **Un tramo mensual** = el que empieza el día 1 y termina el último día del mes; ahí la fórmula da exactamente la meta (días/días = 1), sin rama especial.
- **Redondeo:** monto a 2 decimales (`r2`), igual que el resto de líneas.
