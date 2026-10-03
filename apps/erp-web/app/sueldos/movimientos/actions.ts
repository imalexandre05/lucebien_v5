'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  crearMovimiento,
  eliminarMovimiento,
  SueldoRpcError,
  type MovimientoInput,
} from '../../../lib/sueldos-repo';

/**
 * Acciones de adelantos, descuentos y bonos.
 *
 * Las acciones de venta (crear, asignar vendedor, eliminar) se mudaron a
 * `apps/erp-web/app/sueldos/ventas/actions.ts` (Tarea 3 del rediseño de sueldos F1,
 * 22-ago-2026), sin cambiar su validación.
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

/**
 * Revalida las dos pantallas que muestran movimientos: la general y la ficha de la persona
 * (`/personal/[id]/movimientos`, que monta el mismo componente). Como `layout` cubre la ficha y
 * todas sus secciones.
 *
 * Basta con esto para que la pantalla se actualice: en Next 14 cualquier `revalidatePath` dentro de
 * una Server Action hace que la respuesta de la acción traiga ya el árbol nuevo de la página
 * actual. Por eso el cliente NO llama `router.refresh()` — eso pedía un segundo render completo y
 * era la mitad de la espera (spec 2026-10-03-adelantos-rendimiento-design.md).
 */
function revalidarMovimientos() {
  revalidatePath('/sueldos/movimientos');
  revalidatePath('/personal/[id]', 'layout');
}

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

export async function accionCrearMovimiento(p: MovimientoInput): Promise<Resultado & { id?: string }> {
  try {
    const admId = await admin();
    if (!admId) return NEGADO;
    if (!p.motivo || p.motivo.trim().length === 0) {
      // La base también lo exige. Acá se corta antes porque el motor **lanza** ante un movimiento
      // sin motivo, y sin motivo nadie puede explicarle después a la persona de dónde salió.
      return { ok: false, error: 'El motivo es obligatorio: sin él, nadie puede explicar ese monto después.' };
    }
    const id = await crearMovimiento(p, admId);
    revalidarMovimientos();
    return { ok: true, id };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEliminarMovimiento(id: string): Promise<Resultado> {
  try {
    if (!(await admin())) return NEGADO;
    await eliminarMovimiento(id);
    revalidarMovimientos();
    return { ok: true };
  } catch (e) {
    return comoResultado(e);
  }
}
