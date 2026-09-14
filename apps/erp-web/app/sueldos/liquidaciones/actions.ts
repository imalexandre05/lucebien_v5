'use server';

import { revalidatePath } from 'next/cache';
import type { Liquidacion } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import {
  anularLiquidacion,
  calcularPreview,
  cerrarLiquidacion,
  corregirLiquidacion,
  crearBorrador,
  eliminarBorrador,
  obtenerLiquidacion,
  CorreccionParcialError,
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

/**
 * El resultado de «Corregir esta liquidación» (spec 2026-08-25-reunion-admin-hoja-de-ruta.md §3.1).
 * No son dos desenlaces sino tres: además de "salió bien" y "salió mal", existe "se anuló pero no
 * se pudo crear el borrador nuevo" — ahí la pantalla no puede tratarlo como un error cualquiera,
 * porque a diferencia de cualquier otro error de este archivo, algo sí quedó escrito en la base.
 * `parcial: true` es la señal para que `cliente.tsx` lo muestre distinto y arme el camino de vuelta.
 */
export type ResultadoCorregir = {
  ok: boolean;
  error?: string;
  codigo?: string;
  parcial?: boolean;
  acuerdoId?: string;
  periodoDesde?: string;
  periodoHasta?: string;
  nuevoBorradorId?: string;
};

/**
 * Anula la liquidación `id` (con motivo) y, en el mismo paso, crea el borrador de reemplazo para
 * el mismo acuerdo y el mismo período — recalculado contra los datos de hoy. No abre un camino
 * nuevo: es `anularLiquidacion()` + `crearBorrador()` tal como ya existen, orquestados por
 * `corregirLiquidacion()`.
 *
 * Si la anulación corre y el borrador nuevo no se puede crear, esta acción no lo esconde detrás de
 * un mensaje genérico: devuelve `parcial: true` con el acuerdo y el período exactos, porque la
 * anulación ya quedó firme —no hay forma de deshacerla— y el administrador tiene que saberlo.
 */
export async function accionCorregir(id: string, motivo: string): Promise<ResultadoCorregir> {
  try {
    if (!(await esAdmin())) {
      return { ok: false, error: 'Sólo el administrador o el dueño corrigen una liquidación.' };
    }
    const { nuevoBorradorId } = await corregirLiquidacion(id, motivo);
    revalidatePath('/sueldos/liquidaciones');
    return { ok: true, nuevoBorradorId };
  } catch (e) {
    if (e instanceof CorreccionParcialError) {
      // La anulación sí escribió en la base: hay que revalidar para que se vea en el acto, aunque
      // el borrador de reemplazo no se haya podido crear.
      revalidatePath('/sueldos/liquidaciones');
      return {
        ok: false,
        parcial: true,
        error: e.message,
        acuerdoId: e.acuerdoId,
        periodoDesde: e.periodoDesde,
        periodoHasta: e.periodoHasta,
      };
    }
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
