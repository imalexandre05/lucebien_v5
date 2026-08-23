'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../../lib/auth';
import {
  anularPagoLiquidacion,
  pagarLiquidacion,
  SueldoRpcError,
  type PagoLiquidacionInput,
} from '../../../../lib/sueldos-repo';

/**
 * Acciones de la pestaña Liquidación y pago (spec §2.6, migración 0080).
 *
 * Mismo gate que `/sueldos/liquidaciones/actions.ts`: sólo admin/dueño registran o anulan un
 * pago. La pantalla ya lo esconde para cualquier otro rol, pero la acción lo vuelve a comprobar
 * — el servidor no confía en que el cliente no haya llamado directo.
 */

type Resultado = { ok: boolean; error?: string; codigo?: string };

async function esAdmin(): Promise<boolean> {
  const sesion = await getSesion();
  if (!sesion) return false;
  const { rol } = sesion.usuario;
  return rol === 'admin' || rol === 'dueno';
}

function comoResultado(e: unknown): Resultado {
  if (e instanceof SueldoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
  return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
}

/** Registra un abono contra una liquidación cerrada. */
export async function accionPagarLiquidacion(empleadoId: string, p: PagoLiquidacionInput): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño registran pagos.' };
    await pagarLiquidacion(p);
    revalidatePath(`/personal/${empleadoId}/pago`);
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Anula un pago con motivo obligatorio. Nunca lo edita ni lo borra. */
export async function accionAnularPagoLiquidacion(
  empleadoId: string,
  pagoId: string,
  motivo: string,
): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño anulan pagos.' };
    await anularPagoLiquidacion(pagoId, motivo);
    revalidatePath(`/personal/${empleadoId}/pago`);
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}
