'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import { declararDia, type CondicionDia } from '../../../lib/asistencias-repo';

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
  for (const d of dias) {
    try {
      await declararDia(d);
      hechos += 1;
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : `${d.fecha}: error desconocido`);
    }
  }

  revalidatePath('/sueldos/asistencia');
  return {
    ok: fallos.length === 0,
    hechos,
    error: fallos.length > 0 ? `${hechos} día(s) declarados. No se pudo con: ${fallos.join(' · ')}` : undefined,
  };
}
