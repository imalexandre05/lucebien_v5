# Contrato con valores pactados — los parámetros se copian al contrato

**Fecha:** 05-oct-2026 · **Ticket:** imalexandre05/lucebien-tablero#20 · **Zona:** crítica (cadena del sueldo, no-negociable 1)
**Decisión del dueño (05-oct):** un cambio de parámetros aplica **sólo a contratos nuevos**; los contratos existentes se **congelan con los valores de hoy**.

## 1. Problema (verificado contra el código, regla 7)

| # | Hecho | Dónde se comprobó |
|---|---|---|
| a | `/configuracion` guarda en la tabla `config`. La liquidación arma `private.sueldo_parametros_config() \|\| a.parametros`; `resolverParametros` completa con los defaults del código lo que falte. Un contrato guarda sólo los **overrides**, así que todo parámetro sin valor propio **sigue a la configuración global**: cambiar `/configuracion` mueve el sueldo de TODOS los contratos, viejos incluidos. | `0098_liquidacion_muestra_horas_estimadas.sql:272`; `packages/core/src/sueldos.ts:160` |
| b | Un contrato nuevo nace con `parametros: {}`. | `app/sueldos/acuerdos/cliente.tsx:130` (`VACIO`) |
| c | El editor muestra como «valor global» (placeholder gris) el default **del código**, no el de `config`; y el cálculo de almuerzo usa también el default del código. Dice una cosa y la liquidación hace otra. | `cliente.tsx:231-232, 895-897` |
| d | Los borradores de liquidación guardan `parametros_usados` y se cierran con los valores viejos sin avisar. | `sueldos-repo.ts:626-639`. **Fuera de alcance**: lo cubre el PR #44 al comparar la entrada completa. |

## 2. Regla nueva

1. **Al crear un contrato se copian dentro de `sueldo_acuerdos.parametros` TODOS los parámetros vigentes en ese momento**: `config` donde esté fijado, default del código donde no. `metaSemanal` (default `null` = «sin meta pactada, se sugiere con las horas») no se copia: `null` y ausente significan lo mismo y no existe clave global que la fije.
2. **Migración de datos idempotente (0118):** cada contrato existente completa su `parametros` con los valores efectivos de hoy (`config` actual `||` defaults) **sin pisar los que ya tiene propios**. Reaplicar no cambia nada.
3. **La liquidación usa los parámetros del contrato.** `config` queda sólo como respaldo si faltara una clave (contratos raros). **No cambia ninguna fórmula ni `sueldo_entrada`**: la precedencia actual (`config || a.parametros`) ya da prioridad al contrato en cada clave; lo que cambia es que el contrato ahora **tiene** todas las claves. Por eso no se reemplaza `sueldo_entrada` (menos riesgo y sin choque con los PR abiertos que la tocan).
4. **UI.** El editor muestra los «Valores pactados» reales del contrato (editables), no textos de ejemplo. En un contrato nuevo parte de los valores vigentes de hoy. `/configuracion` dice: «Estos valores se usan para los contratos NUEVOS. Los contratos ya creados conservan los suyos».
5. **Fuera de alcance:** el cierre que compara parámetros (PR #44).

## 3. Diseño

- **Una sola fuente del mapeo `config → parámetro`:** el que ya existe en `private.sueldo_parametros_config()`. Se expone con una RPC delgada `public.sueldo_parametros_vigentes()` (sólo admin, `private.app_es_admin()`) que devuelve ese jsonb **sin** defaults del código. El servidor lo completa con `resolverParametros()` (core), que es la única fuente de los defaults. Así no se duplica ni el mapa ni los defaults en TypeScript.
- **`crearAcuerdo` (sesión del admin, sin `getAdminClient`):** `parametros = { ...vigentes, ...lo que el formulario trae }`, con `metaSemanal` null fuera. Autoritativo en el servidor: aunque la pantalla mande `{}`, el contrato queda completo.
- **`actualizarAcuerdo`** no completa nada: se guarda lo que el administrador ve y edita.
- **Migración 0118** (datos): `update sueldo_acuerdos set parametros = <defaults hoy> || <config hoy> || parametros`. Los defaults de la migración son una **foto** de `PARAMETROS_SUELDO_DEFAULT` a la fecha; un test de vitest compara el literal de la migración con el core para detectar deriva.
- **Pruebas:** vitest (copia/completado, `metaSemanal` fuera, deriva de defaults) + prueba SQL en Postgres local.

### Lista verificada de claves (16 en `ParametrosSueldo`; mapa de `config` en 0078)

| Parámetro del contrato | Clave en `config` | Default del código |
|---|---|---|
| toleranciaMinutos | sueldo_tolerancia_minutos | 10 |
| tardanzasLibres | sueldo_tardanzas_libres | 3 |
| penalidadTardanza | sueldo_penalidad_tardanza | 5 |
| valorAlmuerzo | sueldo_valor_almuerzo | 8 |
| horasMinimasAlmuerzo | sueldo_horas_minimas_almuerzo | 12 |
| valorCapacitacion | sueldo_valor_capacitacion | 25 |
| bonoMetaSemanal | sueldo_bono_meta_semanal | 30 |
| factorMeta | sueldo_factor_meta | 1 |
| metaSemanalFija | sueldo_meta_semanal_fija | false |
| pctComision | sueldo_pct_comision | 0.02 |
| montoMinimoComision | sueldo_monto_minimo_comision | 120 |
| diasDescuentoPorFalta | sueldo_dias_descuento_por_falta | 2 |
| metaPorHora | sueldo_meta_por_hora | 1500/33 (45.45454545454545) |
| factorHoraFueraContrato | sueldo_factor_hora_fuera_contrato | 1 |
| pausaMinimaMinutos | sueldo_pausa_minima_minutos | 15 |
| metaSemanal | — (sin clave global) | null → no se copia |

Las claves `sueldo_margen_horas_dia_minutos` y `sueldo_metodos_pago` están en `config` pero **no** son parámetros del contrato y no se copian.

**PR #54 (`feat/pago-por-puntos`, 0117):** agrega `sueldo_puntos_meta_mensual` y `sueldo_soles_por_punto` (`puntosMetaMensual`, `solesPorPunto`). **No están en `main`** (comprobado), así que esta copia no las incluye: **#54 debe sumarlas** a la lista blanca del `check`, a `PARAMETROS_SUELDO_DEFAULT` y al congelado de contratos. Ambas nacen **vacías = desactivado**, por lo que sin la clave el contrato sigue funcionando; pero si el dueño las activa después sin que el contrato las tenga, volverían a seguir a la configuración global.

## 4. Pruebas exigidas (antes del código)

1. Contrato nuevo → `parametros` queda con las 15 claves (config si está fijada, default si no).
2. Cambiar `config` después → el contrato nuevo **no** se mueve.
3. Contrato existente → queda congelado con los valores de hoy; un valor propio previo **no** se pisa.
4. La liquidación (`sueldo_entrada`) de un contrato existente es **idéntica** antes y después de la 0118.
5. Reaplicar la 0118 no cambia nada.

## 5. Defaults inventados

Ninguno: no se agrega ningún parámetro ni se cambia ninguna regla de negocio. Sólo cambia **desde cuándo** vale cada valor.

## 6. Riesgos

- Si `config` tuviera basura al aplicar la 0118, `sueldo_parametros_config()` corta con `CONFIG:`: la migración falla entera y no congela valores equivocados.
- Tras la 0118, cambiar un parámetro de `/configuracion` ya no altera ningún contrato existente: **es lo pedido**, pero el administrador tiene que editar cada contrato si quiere el cambio. El aviso de §2.4 lo dice.
