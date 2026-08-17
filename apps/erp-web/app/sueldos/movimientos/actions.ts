'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  asignarVendedor,
  crearMovimiento,
  crearVenta,
  eliminarMovimiento,
  eliminarVenta,
  SueldoRpcError,
  type MovimientoInput,
  type VentaInput,
} from '../../../lib/sueldos-repo';

/**
 * Acciones de adelantos, descuentos, bonos y ventas.
 *
 * Todas comprueban el rol de nuevo: la pantalla ya está cerrada, pero una Server Action es un
 * endpoint público. La puerta definitiva son las policies de la 0072, que exigen administrador
 * tanto en `using` como en `with check`.
 *
 * Borrar una fila que ya se pagó no falla acá sino en el trigger de la base, con `CONGELADA`. Está
 * bien que sea así: el que tiene que decir la última palabra sobre un pago emitido es el que
 * guarda el pago, no la pantalla.
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

export async function accionCrearMovimiento(p: MovimientoInput): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return NEGADO;
    if (!p.motivo || p.motivo.trim().length === 0) {
      // La base también lo exige. Acá se corta antes porque el motor **lanza** ante un movimiento
      // sin motivo, y sin motivo nadie puede explicarle después a la persona de dónde salió.
      return { ok: false, error: 'El motivo es obligatorio: sin él, nadie puede explicar ese monto después.' };
    }
    await crearMovimiento(p, admId);
    revalidatePath('/sueldos/movimientos');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEliminarMovimiento(id: string): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    await eliminarMovimiento(id);
    revalidatePath('/sueldos/movimientos');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionCrearVenta(p: VentaInput): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    if (!Number.isFinite(p.monto) || p.monto < 0) {
      return { ok: false, error: 'El monto de la boleta tiene que ser un número mayor o igual a cero.' };
    }
    await crearVenta(p);
    revalidatePath('/sueldos/movimientos');
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
    revalidatePath('/sueldos/movimientos');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEliminarVenta(id: string): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    await eliminarVenta(id);
    revalidatePath('/sueldos/movimientos');
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}
