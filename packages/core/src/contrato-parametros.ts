import { resolverParametros, type ParametrosSueldo } from './sueldos';

/**
 * Los parámetros que un contrato guarda como suyos: los 15 de `ParametrosSueldo` salvo
 * `metaSemanal`, cuyo default es `null` («sin meta pactada, se sugiere con las horas») y que no
 * tiene clave global. Misma lista que `private.sueldo_parametros_defaults()` (migración 0118); un
 * test compara las dos.
 */
export const CLAVES_PARAMETROS_CONTRATO = [
  'toleranciaMinutos',
  'tardanzasLibres',
  'penalidadTardanza',
  'valorAlmuerzo',
  'horasMinimasAlmuerzo',
  'valorCapacitacion',
  'bonoMetaSemanal',
  'factorMeta',
  'metaSemanalFija',
  'pctComision',
  'montoMinimoComision',
  'diasDescuentoPorFalta',
  'metaPorHora',
  'factorHoraFueraContrato',
  'pausaMinimaMinutos',
] as const satisfies readonly (keyof ParametrosSueldo)[];

/**
 * Los valores pactados de un contrato NUEVO (spec 2026-10-05-contrato-valores-pactados-design.md).
 *
 * Un contrato no sigue a `/configuracion`: al crearlo se copian todos los parámetros vigentes en
 * ese momento, para que un cambio posterior de la configuración aplique sólo a contratos nuevos.
 * Precedencia: default del código ← lo fijado en `config` (`globales`) ← lo que trae el
 * formulario (`propios`). Valida igual que el motor: clave desconocida o negativo lanzan.
 *
 * Pura: no lee `config` ni la fecha; quien invoca le pasa los `globales`.
 */
export function parametrosDeContratoNuevo(
  globales: Partial<ParametrosSueldo> = {},
  propios: Partial<ParametrosSueldo> = {},
): Partial<ParametrosSueldo> {
  const efectivos = resolverParametros({ ...globales, ...definidos(propios) });
  const { metaSemanal, ...resto } = efectivos;
  return metaSemanal == null ? resto : { ...resto, metaSemanal };
}

// Un campo en blanco del formulario (`undefined`, o `null` salvo en `metaSemanal`) no tiene que
// borrar el valor global al hacer el spread.
function definidos(p: Partial<ParametrosSueldo>): Partial<ParametrosSueldo> {
  return Object.fromEntries(
    Object.entries(p).filter(([k, v]) => v !== undefined && (v !== null || k === 'metaSemanal')),
  ) as Partial<ParametrosSueldo>;
}
