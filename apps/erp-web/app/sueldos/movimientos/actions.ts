'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  crearMovimiento,
  eliminarMovimiento,
  validarMovimiento,
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

/**
 * `escrito: false` marca los rechazos de los que se sabe con certeza que NO tocaron la base: los
 * que se cortan antes de intentar el insert o el delete. Cualquier otro `ok: false` es incierto
 * —un error de Supabase después de que la escritura pudo hacerse— y la pantalla lo trata como un
 * corte: no devuelve lo tipeado (evita un adelanto duplicado) y pide la lista real.
 */
type Resultado = { ok: boolean; error?: string; codigo?: string; escrito?: false };

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

const NEGADO = {
  ok: false as const,
  escrito: false as const,
  error: 'Sólo el administrador o el dueño pueden cargar esto.',
};

/** Revalida sin dejar que un fallo acá convierta en error una escritura que ya se hizo. */
function revalidarSinFallar() {
  try {
    revalidarMovimientos();
  } catch {
    // La escritura ya está hecha. Si la revalidación falla, la pantalla igual se resincroniza en
    // la próxima navegación; devolver error acá invitaría a registrar dos veces.
  }
}

export async function accionCrearMovimiento(p: MovimientoInput): Promise<Resultado & { id?: string }> {
  // ── Antes del insert: todo rechazo acá es seguro que no escribió (`escrito: false`). ──
  let admId: string | null;
  try {
    admId = await admin();
  } catch (e) {
    return { ...comoResultado(e), escrito: false };
  }
  if (!admId) return NEGADO;
  if (!p.motivo || p.motivo.trim().length === 0) {
    // La base también lo exige. Acá se corta antes porque el motor **lanza** ante un movimiento
    // sin motivo, y sin motivo nadie puede explicarle después a la persona de dónde salió.
    return {
      ok: false,
      escrito: false,
      error: 'El motivo es obligatorio: sin él, nadie puede explicar ese monto después.',
    };
  }
  try {
    validarMovimiento(p);
  } catch (e) {
    return { ...comoResultado(e), escrito: false };
  }

  // ── El insert: un error desde acá es incierto (pudo escribirse y perderse la respuesta). ──
  let id: string;
  try {
    id = await crearMovimiento(p, admId);
  } catch (e) {
    return comoResultado(e);
  }
  revalidarSinFallar();
  return { ok: true, id };
}

export async function accionEliminarMovimiento(id: string): Promise<Resultado> {
  let esAdmin: boolean;
  try {
    esAdmin = Boolean(await admin());
  } catch (e) {
    return { ...comoResultado(e), escrito: false };
  }
  if (!esAdmin) return NEGADO;
  try {
    await eliminarMovimiento(id);
  } catch (e) {
    return comoResultado(e);
  }
  revalidarSinFallar();
  return { ok: true };
}
