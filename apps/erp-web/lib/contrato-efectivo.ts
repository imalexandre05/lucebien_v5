import { resolverParametros, type ParametrosSueldo } from '@scilb/core';
import { parametrosVigentes, type AcuerdoSueldo } from './sueldos-repo';

/**
 * Los parámetros que de verdad se aplican a un contrato: lo vigente en /configuracion y, encima,
 * lo que el contrato guardó como suyo (`acuerdo.parametros`). Es la misma precedencia del motor.
 * Sólo para el administrador (`parametrosVigentes` es una RPC de admin). Si /configuracion no se
 * puede leer, se usa lo del contrato sobre los defaults del código, sin romper la pantalla.
 */
export async function parametrosEfectivos(acuerdo: AcuerdoSueldo): Promise<ParametrosSueldo> {
  const globales = await parametrosVigentes().catch(() => ({}) as Partial<ParametrosSueldo>);
  return resolverParametros({ ...globales, ...acuerdo.parametros });
}
