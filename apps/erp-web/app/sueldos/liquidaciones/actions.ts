'use server';

import { revalidatePath } from 'next/cache';
import type { Liquidacion } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import {
  anularLiquidacion,
  calcularPreview,
  cerrarLiquidacion,
  crearBorrador,
  eliminarBorrador,
  obtenerLiquidacion,
  SueldoRpcError,
  type EntradaConContexto,
  type LiquidacionDetalle,
} from '../../../lib/sueldos-repo';

/**
 * Acciones de la liquidación.
 *
 * **El cálculo vive del lado del servidor, siempre.** El navegador pide «calculá el contrato X» y
 * recibe el resultado; nunca manda un total, ni las líneas, ni las horas. Ese es el motivo de que
 * el preview sea una Server Action y no una función del cliente: si el cliente calculara y después
 * mandara lo calculado, manipular el formulario alcanzaría para escribir cualquier pago.
 */

type Resultado<T = undefined> = { ok: boolean; error?: string; codigo?: string; datos?: T };

async function esAdmin(): Promise<boolean> {
  const sesion = await getSesion();
  if (!sesion) return false;
  const { rol } = sesion.usuario;
  return rol === 'admin' || rol === 'dueno';
}

function comoResultado(e: unknown): Resultado<never> {
  if (e instanceof SueldoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
  return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
}

export type Preview = { entrada: EntradaConContexto; liquidacion: Liquidacion };

/**
 * Calcula UN TRAMO del periodo sin escribir nada. Es lo que se mira antes de decidir.
 *
 * `desde`/`hasta` son el rango que el administrador eligió liquidar esta vez (spec liquidación-
 * por-tramos, C-4) — no necesariamente el acuerdo completo: un contrato de tres meses se puede
 * liquidar mes a mes. Corta con `DATO` nombrando las fechas si algún día contratado del tramo
 * quedó sin declarar: un día sin dato no es una falta, y darlo por falta costaría dos días de
 * sueldo.
 */
export async function accionCalcular(
  acuerdoId: string,
  desde: string,
  hasta: string,
): Promise<Resultado<Preview>> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño liquidan.' };
    const datos = await calcularPreview(acuerdoId, desde, hasta);
    return { ok: true, datos };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * Guarda el borrador de un tramo. Recibe un id de acuerdo y el rango: el total lo calcula el
 * servidor de nuevo.
 */
export async function accionCrearBorrador(
  acuerdoId: string,
  desde: string,
  hasta: string,
): Promise<Resultado<{ id: string }>> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño liquidan.' };
    const id = await crearBorrador(acuerdoId, desde, hasta);
    revalidatePath('/sueldos/liquidaciones');
    return { ok: true, datos: { id } };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * Cierra. A partir de acá el pago está congelado: se escriben las líneas, se sellan los
 * movimientos y las ventas consumidos, y el estado pasa a `'cerrada'`.
 *
 * Si devuelve `DESACTUALIZADA`, alguien cargó un adelanto, una venta, un almuerzo o una
 * capacitación entre el cálculo y el cierre. No es un fallo: hay que descartar el borrador y
 * volver a calcular, porque si no esa fila quedaría sellada sin haber entrado en el pago.
 */
export async function accionCerrar(id: string): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño cierran.' };
    await cerrarLiquidacion(id);
    revalidatePath('/sueldos/liquidaciones');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionAnular(id: string, motivo: string): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño anulan.' };
    await anularLiquidacion(id, motivo);
    revalidatePath('/sueldos/liquidaciones');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEliminarBorrador(id: string): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño liquidan.' };
    await eliminarBorrador(id);
    revalidatePath('/sueldos/liquidaciones');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * El detalle congelado de una liquidación, para verlo o reimprimirlo.
 *
 * Se lee del snapshot, **no se recalcula**. Recalcular al abrir mostraría un número distinto del
 * que se pagó en cuanto alguien edite un parámetro de Configuración — que es justamente lo que el
 * congelado existe para impedir.
 */
export async function accionVerDetalle(id: string): Promise<Resultado<LiquidacionDetalle>> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño ven el detalle.' };
    const datos = await obtenerLiquidacion(id);
    if (!datos) return { ok: false, error: 'No existe esa liquidación.' };
    return { ok: true, datos };
  } catch (e) {
    return comoResultado(e);
  }
}
