'use server';

import { revalidatePath } from 'next/cache';
import type { ParametrosSueldo } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import {
  actualizarAcuerdo,
  cambiarEstadoAcuerdo,
  crearAcuerdo,
  type AcuerdoInput,
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

export type AcuerdoForm = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  sueldoPactado: number;
  escala: number | null;
  almuerzoHabilitado: boolean;
  parametros: Partial<ParametrosSueldo>;
  turnos: { diaSemana: number; horaInicio: string; horaFin: string; lugar: string | null }[];
};

/**
 * Lo que se comprueba antes de tocar la base. No reemplaza a los `check` de la 0072: los duplica
 * a propósito, porque un mensaje de constraint no le dice nada a quien está cargando un contrato.
 *
 * Lo que NO se comprueba acá es el solape de turnos: eso lo hace la restricción de exclusión de
 * la 0072 y también `resumirHorario()` del core, con un mensaje mejor que el que escribiríamos.
 */
function validar(f: AcuerdoForm): string | null {
  if (!f.empleadoId) return 'Elegí a la persona del contrato.';
  if (!f.fechaInicio || !f.fechaFin) return 'El contrato necesita fecha de inicio y de fin.';
  if (f.fechaFin < f.fechaInicio) return 'La fecha de fin no puede ser anterior a la de inicio.';
  if (!Number.isFinite(f.sueldoPactado) || f.sueldoPactado <= 0) {
    return 'El sueldo pactado tiene que ser mayor que cero.';
  }
  if (f.escala != null && (!Number.isInteger(f.escala) || f.escala < 1)) {
    return 'La escala tiene que ser un número entero de 1 en adelante.';
  }
  for (const t of f.turnos) {
    if (!t.horaInicio || !t.horaFin) return 'Hay un turno sin hora de inicio o de fin.';
    if (t.horaFin <= t.horaInicio) {
      return `Turno inválido el día ${t.diaSemana}: ${t.horaInicio}–${t.horaFin}. La salida tiene que ser posterior a la entrada.`;
    }
  }
  return null;
}

const aInput = (f: AcuerdoForm): AcuerdoInput => ({
  empleadoId: f.empleadoId,
  fechaInicio: f.fechaInicio,
  fechaFin: f.fechaFin,
  modalidad: f.modalidad,
  sueldoPactado: f.sueldoPactado,
  escala: f.escala,
  almuerzoHabilitado: f.almuerzoHabilitado,
  parametros: f.parametros,
  turnos: f.turnos,
});

export async function accionCrearAcuerdo(f: AcuerdoForm): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden pactar un contrato.' };

    const problema = validar(f);
    if (problema) return { ok: false, error: problema };

    const id = await crearAcuerdo(aInput(f), admId);
    revalidatePath('/sueldos/acuerdos');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el contrato.' };
  }
}

export async function accionActualizarAcuerdo(id: string, f: AcuerdoForm): Promise<Resultado> {
  try {
    const admId = await admin();
    if (!admId) return { ok: false, error: 'Sólo el administrador o el dueño pueden editar un contrato.' };

    const problema = validar(f);
    if (problema) return { ok: false, error: problema };

    await actualizarAcuerdo(id, aInput(f));
    revalidatePath('/sueldos/acuerdos');
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
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar el estado.' };
  }
}
