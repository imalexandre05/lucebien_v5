'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  asignarVendedor,
  crearVenta,
  eliminarVenta,
  SueldoRpcError,
  type VentaInput,
} from '../../../lib/sueldos-repo';

/**
 * Acciones de ventas — mudadas de `/sueldos/movimientos` (Tarea 3 del rediseño de sueldos F1,
 * 22-ago-2026). Antes vivían junto a las de adelantos/descuentos; ver ese archivo para la
 * justificación de por qué se separaron.
 *
 * La validación es exactamente la que tenían en `/sueldos/movimientos`: no se aflojó ni se
 * endureció nada al mudarlas.
 *
 * Todas comprueban el rol de nuevo: la pantalla ya está cerrada, pero una Server Action es un
 * endpoint público. La puerta definitiva son las policies de la 0072, que exigen administrador
 * tanto en `using` como en `with check`.
 *
 * Borrar una venta que ya se liquidó no falla acá sino en el trigger de la base, con `CONGELADA`.
 */

type Resultado = { ok: boolean; error?: string; codigo?: string };

async function admin(): Promise<string | null> {
  const sesion = await getSesion();
  if (!sesion) return null;
  const { rol } = sesion.usuario;
  return rol === 'admin' || rol === 'dueno' ? sesion.usuario.id : null;
}

function comoResultado(e: unknown): Resultado {
  if (e instanceof SueldoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
  return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
}

const NEGADO = { ok: false as const, error: 'Sólo el administrador o el dueño pueden cargar esto.' };

export async function accionCrearVenta(p: VentaInput): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    if (!Number.isFinite(p.monto) || p.monto < 0) {
      return { ok: false, error: 'El monto de la boleta tiene que ser un número mayor o igual a cero.' };
    }
    await crearVenta(p);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Saca una venta de la cola de sin-asignar. Las comisiones son individuales: sin vendedor, no se paga. */
export async function accionAsignarVendedor(ventaId: string, empleadoId: string): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    if (!empleadoId) return { ok: false, error: 'Elegí a quién corresponde la venta.' };
    await asignarVendedor(ventaId, empleadoId);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEliminarVenta(id: string): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    await eliminarVenta(id);
    revalidatePath('/sueldos/ventas');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}
