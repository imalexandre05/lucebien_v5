# SPEC — Escalas salariales editables (ticket 35)

> Spec y código van en commits separados (Zone Guard). Zona: sueldos (sólo la **sugerencia** del
> contrato; no entra en la cadena puntos → evaluación → pago).

## Problema
`ESCALAS_SUELDO_DEFAULT` (`packages/core/src/sueldos.ts`) está fija en el código y alimenta el
«sueldo sugerido» del contrato. Va contra el no-negociable 5.

## Datos del dueño (Excel, hoja PARAMETROS)
| Escala | S/ por hora | Antigüedad |
|---|---|---|
| 1 | 2,90 | 1er mes |
| 2 | 3,20 | 1er mes (el Excel no distingue de la 1) |
| 3 | 3,50 | hasta el 3er mes |
| 4 | 3,80 | desde el 5to mes |
| 5 | 5,00 | desde el 9no mes |

El ascenso «va de acuerdo a evaluación»: el sistema **sugiere**, el administrador **confirma**.

## Diseño
1. Cada escala tiene dos parámetros en `/configuracion` (sección «Escalas salariales»), con default
   en `config-catalogo.ts` (sin migración; el catálogo ya vive en código):
   `escala_N_tarifa_hora` y `escala_N_desde_mes` (N = 1..5).
2. `desde_mes` = meses **completos** de antigüedad desde los que aplica la escala. Defaults
   **inventados para cubrir el solape del Excel** (a confirmar, ver pendientes): 1→0, 2→1, 3→2,
   4→4 («5to mes» = 4 meses cumplidos), 5→8 («9no mes» = 8 cumplidos).
3. Core (puro): `escalasDesdeConfig(cfg)` arma la tabla; si una clave falta o no es válida usa el
   default de esa clave. `escalaSugeridaPorAntiguedad(meses, escalas)` devuelve la escala de mayor
   `desdeMes` ≤ meses. `sueldoSugerido` ya recibe la tabla.
4. UI de contratos: el selector de escala usa la tabla configurada; junto a la escala se muestra
   «Sugerida: escala N (X meses)» cuando se conoce la fecha de ingreso. Nunca se aplica sola.

## Casos que deben probarse
- Defaults == valores del Excel (tarifas 2,9/3,2/3,5/3,8/5).
- `escalasDesdeConfig` con config vacía = defaults; con valor editado lo respeta; con valor
  inválido (vacío, negativo, texto) cae al default de esa clave.
- `escalaSugeridaPorAntiguedad`: 0→1, 1→2, 2→3, 3→3, 4→4, 8→5, 40→5; meses negativos → escala 1.
- Con una tabla editada cambia la sugerencia y `sueldoSugerido`.

## Pendiente de negocio
Confirmar con el dueño los tramos de meses y si el ascenso exige además nota mínima de evaluación.
