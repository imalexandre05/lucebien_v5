'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import { soloHastaHoy } from '@scilb/core';
import { hoyPeru } from '../../../lib/fechas';
import { declararDia, guardarHorarioAcordado, marcarRevisados, type CondicionDia } from '../../../lib/asistencias-repo';

/**
 * Acciones de la declaración de asistencia.
 *
 * Cada una vuelve a comprobar el rol: una Server Action es un endpoint público, y que la pantalla
 * no muestre el botón no impide que alguien llame a la acción. La puerta definitiva sigue siendo
 * la policy `asist_admin_write` de la base.
 */

type Resultado = { ok: boolean; error?: string };

async function esAdmin(): Promise<boolean> {
  const sesion = await getSesion();
  if (!sesion) return false;
  const { rol } = sesion.usuario;
  return rol === 'admin' || rol === 'dueno';
}

export type DiaForm = {
  empleadoId: string;
  fecha: string;
  turno?: string;
  condicion: CondicionDia;
  horaEntrada: string | null;
  horaSalida: string | null;
  tardanzaJustificada: boolean;
  faltaJustificada: boolean;
  motivoJustificacion: string | null;
};

export async function accionDeclararDia(d: DiaForm): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño declaran la asistencia.' };
    await declararDia(d);
    revalidatePath('/sueldos/asistencia');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el día.' };
  }
}

/**
 * Declara varios días de una sola vez.
 *
 * **Es una afirmación del administrador, no una inferencia del sistema.** La diferencia importa:
 * el sistema nunca decide solo que alguien trabajó — eso es exactamente lo que la columna
 * `condicion` existe para impedir. Acá una persona dice «estos días se trabajaron con el horario
 * pactado», y la auditoría de la 0072 deja el rastro de quién lo dijo y cuándo.
 *
 * Si uno falla, se sigue con los demás y se devuelven los errores juntos: cortar en el primero
 * dejaría la mitad del periodo declarada y la otra mitad no, sin decir cuál es cuál.
 */
export async function accionDeclararVarios(dias: DiaForm[]): Promise<Resultado & { hechos: number }> {
  if (!(await esAdmin())) {
    return { ok: false, hechos: 0, error: 'Sólo el administrador o el dueño declaran la asistencia.' };
  }

  const fallos: string[] = [];
  let hechos = 0;
  // El servidor no confía en la lista del cliente: los días futuros no entran en la acción masiva.
  let aDeclarar: DiaForm[];
  try {
    aDeclarar = soloHastaHoy(dias, hoyPeru());
  } catch (e) {
    return { ok: false, hechos: 0, error: e instanceof Error ? e.message : 'Lista de días inválida.' };
  }
  const descartados = dias.length - aDeclarar.length;
  for (const d of aDeclarar) {
    try {
      await declararDia(d);
      hechos += 1;
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : `${d.fecha}: error desconocido`);
    }
  }

  revalidatePath('/sueldos/asistencia');
  return {
    ok: fallos.length === 0 && descartados === 0,
    hechos,
    error:
      fallos.length > 0
        ? `${hechos} día(s) declarados. No se pudo con: ${fallos.join(' · ')}`
        : descartados > 0
          ? `${hechos} día(s) declarados. ${descartados} día(s) son posteriores a hoy y no se declararon.`
          : undefined,
  };
}

/**
 * Marca días como revisados («Está bien» y «Todo bien» de la ficha). No cambia ningún dato: el
 * pago sale igual. Un día sin fila no tiene nada que marcar, así que los de tipo «sin marca» no
 * se cierran por aquí (spec ficha-unica-asistencia-por-revisar §4).
 */
export async function accionMarcarRevisados(empleadoId: string, fechas: string[]): Promise<Resultado> {
  try {
    const sesion = await getSesion();
    if (!sesion || !(sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno')) {
      return { ok: false, error: 'Sólo el administrador o el dueño revisan la asistencia.' };
    }
    if (!Array.isArray(fechas) || fechas.some((f) => typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f))) {
      return { ok: false, error: 'La lista de días no es válida.' };
    }
    const hechos = await marcarRevisados(empleadoId, fechas, sesion.usuario.id);
    revalidatePath('/personal');
    revalidatePath('/sueldos/asistencia');
    return hechos > 0 || fechas.length === 0
      ? { ok: true }
      : { ok: false, error: 'No se encontró ningún día para marcar. Recarga la página e inténtalo de nuevo.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo marcar como revisado.' };
  }
}

/**
 * «Horario acordado ese día» de la lista «Por revisar» (decisión del dueño n.º 1, 19-oct-2026).
 * Guarda la hora de inicio acordada (o la quita con `inicio = null`); desde entonces la tardanza de
 * ese día se mide contra ella. Las horas trabajadas no cambian.
 */
export async function accionHorarioAcordado(
  empleadoId: string,
  fecha: string,
  inicio: string | null,
  motivo: string | null,
): Promise<Resultado> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Sólo el administrador o el dueño acuerdan el horario de un día.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'El día no es válido.' };
    if (inicio !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(inicio)) return { ok: false, error: 'Pon la hora de inicio, por ejemplo 09:00.' };
    const limpio = motivo?.trim() ? motivo.trim() : null;
    if (limpio && limpio.length > 300) return { ok: false, error: 'El motivo puede tener hasta 300 letras.' };
    const hechos = await guardarHorarioAcordado(empleadoId, fecha, inicio, limpio);
    if (hechos === 0) return { ok: false, error: 'No se encontró ese día. Recarga la página e inténtalo de nuevo.' };
    revalidatePath('/personal');
    revalidatePath('/sueldos/asistencia');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el horario acordado.' };
  }
}
