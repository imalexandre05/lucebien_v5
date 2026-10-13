import { resolverParametros, type ParametrosSueldo } from './sueldos';

/**
 * Los parámetros que un contrato guarda como suyos: 17 de `ParametrosSueldo`, salvo
 * `metaSemanal`, cuyo default es `null` («sin meta pactada, se sugiere con las horas») y que no
 * tiene clave global. Incluye `puntosMetaMensual` y `solesPorPunto` (pago por puntos, spec §8.1):
 * `null` = este contrato no cobra por puntos. Misma lista que `private.sueldo_parametros_defaults()`
 * (migración 0126); un test compara las dos.
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
  'puntosMetaMensual',
  'solesPorPunto',
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
  // Sólo las claves que el contrato guarda (la lista blanca de la base): si el core suma un
  // parámetro que todavía no está en el `check` de sueldo_acuerdos.parametros, no se copia.
  const salida: Record<string, unknown> = {};
  for (const clave of CLAVES_PARAMETROS_CONTRATO) salida[clave] = efectivos[clave];
  if (efectivos.metaSemanal != null) salida.metaSemanal = efectivos.metaSemanal;
  return salida as Partial<ParametrosSueldo>;
}

const CLAVES_NULL_EXPLICITO: ReadonlySet<string> = new Set(['metaSemanal', 'puntosMetaMensual', 'solesPorPunto']);

// Un campo en blanco del formulario (`undefined`, o `null` salvo en las claves que admiten null)
// no tiene que borrar el valor global al hacer el spread. En `puntosMetaMensual` y `solesPorPunto`
// un `null` explícito SÍ se conserva: significa «este contrato no cobra por puntos».
function definidos(p: Partial<ParametrosSueldo>): Partial<ParametrosSueldo> {
  return Object.fromEntries(
    Object.entries(p).filter(([k, v]) => v !== undefined && (v !== null || CLAVES_NULL_EXPLICITO.has(k))),
  ) as Partial<ParametrosSueldo>;
}
