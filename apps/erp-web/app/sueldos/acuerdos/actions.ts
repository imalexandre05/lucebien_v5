'use server';

import { revalidatePath } from 'next/cache';
import { tarifaDelDia, type ParametrosSueldo } from '@scilb/core';
import { validarAcuerdo, type AcuerdoForm } from '../../../lib/acuerdo-validar';
import { getSesion } from '../../../lib/auth';
import {
  cambiosParaCore,
  actualizarAcuerdo,
  cambiarEstadoAcuerdo,
  cambiarFrecuencia,
  crearAcuerdo,
  planDeCambio,
  type AcuerdoInput,
  type CambioFrecuenciaInput,
  type EstadoAcuerdo,
  type ModalidadAcuerdo,
} from '../../../lib/sueldos-repo';

/**
 * Acciones de la pantalla de contratos.
 *
 * Toda escritura vuelve a comprobar el rol acá, aunque la pantalla ya no le muestre los botones a
 * nadie más: una Server Action es un endpoint público, y esconder el botón no esconde la acción.
 * Es la segunda de tres puertas — la tercera y definitiva son las policies de la 0072.
 *
 * Los errores se devuelven como texto, no se lanzan: en esta pantalla el error normal no es un
 * fallo del sistema sino un dato mal tipeado (un horario solapado, una escala inexistente), y el
 * mensaje del motor o de la base ya explica qué pasó.
 */

type Resultado = { ok: boolean; error?: string; id?: string };

async function admin(): Promise<string | null> {
  const sesion = await getSesion();
  if (!sesion) return null;
  const { rol } = sesion.usuario;
  if (rol !== 'admin' && rol !== 'dueno') return null;
  return sesion.usuario.id;
}

export type { AcuerdoForm };

const aInput = (f: AcuerdoForm): AcuerdoInput => ({
  empleadoId: f.empleadoId,
  fechaInicio: f.fechaInicio,
  fechaFin: f.fechaFin,
  modalidad: f.modalidad,
  cadaDias: f.modalidad === 'dias' ? f.cadaDias : null,
  sueldoPactado: f.tarifaHora != null ? 0 : f.sueldoPactado,
  tarifaHora: f.tarifaHora ?? null,
  escala: f.escala,
  almuerzoHabilitado: f.almuerzoHabilitado,
  parametros: f.parametros,
  turnos: f.turnos,
});

export async function accionCrearAcuerdo(f: AcuerdoForm): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden pactar un contrato.' };

    const problema = validarAcuerdo(f);
    if (problema) return { ok: false, error: problema };

    const id = await crearAcuerdo(aInput(f), admId);
    revalidatePath('/sueldos/acuerdos');
    // ROTURA 3 (validador de flujo 23-ago-2026): este mismo editor se monta en
    // /personal/[id]/contrato (T9), una ruta dinámica que esta línea sola no alcanza — 'layout'
    // revalida ese path y todo lo que cuelga de él, para cualquier id, igual que ya hacen
    // /configuracion/permisos y /notificaciones para su propio alcance amplio.
    revalidatePath('/personal', 'layout');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el contrato.' };
  }
}

export async function accionActualizarAcuerdo(id: string, f: AcuerdoForm): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden editar un contrato.' };

    const problema = validarAcuerdo(f);
    if (problema) return { ok: false, error: problema };

    await actualizarAcuerdo(id, aInput(f));
    revalidatePath('/sueldos/acuerdos');
    // ROTURA 3 (validador de flujo 23-ago-2026): este mismo editor se monta en
    // /personal/[id]/contrato (T9), una ruta dinámica que esta línea sola no alcanza — 'layout'
    // revalida ese path y todo lo que cuelga de él, para cualquier id, igual que ya hacen
    // /configuracion/permisos y /notificaciones para su propio alcance amplio.
    revalidatePath('/personal', 'layout');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el contrato.' };
  }
}

/**
 * Un contrato en `'borrador'` se puede editar libremente; en `'vigente'` es el que se liquida.
 * El paso a `'liquidado'` no se hace desde acá: lo deja la RPC del cierre, y ponerlo a mano
 * escondería el contrato de la pantalla de liquidación sin haber emitido ningún pago.
 */
export async function accionCambiarEstado(id: string, estado: EstadoAcuerdo): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden cambiar el estado.' };
    if (estado === 'liquidado') {
      return { ok: false, error: 'El estado "liquidado" lo pone el cierre de la liquidación, no esta pantalla.' };
    }
    await cambiarEstadoAcuerdo(id, estado);
    revalidatePath('/sueldos/acuerdos');
    // ROTURA 3 (validador de flujo 23-ago-2026): este mismo editor se monta en
    // /personal/[id]/contrato (T9), una ruta dinámica que esta línea sola no alcanza — 'layout'
    // revalida ese path y todo lo que cuelga de él, para cualquier id, igual que ya hacen
    // /configuracion/permisos y /notificaciones para su propio alcance amplio.
    revalidatePath('/personal', 'layout');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar el estado.' };
  }
}

// ── Cambiar cómo se paga (spec frecuencia-pago-flexible §3.2 y §6) ───────────────────────────

export type PlanCambio = {
  /** Primer día del próximo pago sin pagar: desde ahí rige el cambio. Null si ya está todo pagado. */
  desde: string | null;
  /** Cuántos días y qué cuota tiene hoy ese pago, para sugerir una proporcional. */
  frecuenciaActual: {
    modalidad: ModalidadAcuerdo;
    cadaDias: number | null;
    sueldoPactado: number;
    /** Tarifa por hora vigente en ese pago. Nula = contrato de sueldo fijo. */
    tarifaHora: number | null;
  };
  fechaFin: string;
  /** Borradores que se cruzan con el cambio: hay que recalcularlos después. */
  borradores: { id: string; periodoDesde: string; periodoHasta: string }[];
};

export async function accionPlanDeCambio(acuerdoId: string): Promise<{ ok: boolean; error?: string; plan?: PlanCambio }> {
  try {
    if (!(await admin())) return { ok: false, error: 'Sólo el administrador o el dueño pueden cambiar cómo se paga.' };
    const { acuerdo, proximo, borradores } = await planDeCambio(acuerdoId);
    const tarifaHora =
      acuerdo.tarifaHora === null
        ? null
        : tarifaDelDia(acuerdo, cambiosParaCore(acuerdo.cambios), proximo?.desde ?? acuerdo.fechaInicio);
    const base = proximo
      ? { modalidad: proximo.modalidad, cadaDias: proximo.cadaDias ?? null, sueldoPactado: proximo.cuotaCompleta, tarifaHora }
      : { modalidad: acuerdo.modalidad, cadaDias: acuerdo.cadaDias, sueldoPactado: acuerdo.sueldoPactado, tarifaHora };
    return {
      ok: true,
      plan: {
        desde: proximo?.desde ?? null,
        frecuenciaActual: base,
        fechaFin: acuerdo.fechaFin,
        borradores: borradores.map((b) => ({ id: b.id, periodoDesde: b.periodoDesde, periodoHasta: b.periodoHasta })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo preparar el cambio.' };
  }
}

/**
 * Confirma el cambio. En un contrato por horas llega `tarifaHora` y no hay cuota. La cuota la manda el administrador (el panel sólo la sugiere): nunca se
 * aplica sola (no-negociable 5). Devuelve los borradores que quedaron desactualizados para que la
 * pantalla pida recalcularlos.
 */
export async function accionCambiarFrecuencia(
  acuerdoId: string,
  c: CambioFrecuenciaInput,
): Promise<{ ok: boolean; error?: string; borradores?: { id: string; periodoDesde: string; periodoHasta: string }[] }> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden cambiar cómo se paga.' };
    const { borradores } = await cambiarFrecuencia(acuerdoId, c, admId);
    revalidatePath('/sueldos/acuerdos');
    revalidatePath('/sueldos/liquidaciones');
    revalidatePath('/personal', 'layout');
    return { ok: true, borradores: borradores.map((b) => ({ id: b.id, periodoDesde: b.periodoDesde, periodoHasta: b.periodoHasta })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar cómo se paga.' };
  }
}
