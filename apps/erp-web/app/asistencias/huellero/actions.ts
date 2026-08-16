'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../../lib/auth';
import {
  crearDispositivo,
  crearMapeo,
  cerrarMapeo,
  borrarMapeo,
  reprocesarMapeo,
} from '../../../lib/huellero-repo';
import { declararDia } from '../../../lib/asistencias-repo';

// El guard de la aplicación. La RLS de la 0075 corta igual del lado de la base: son dos redes,
// no una. Si alguna vez este chequeo se cae por un refactor, la base sigue diciendo que no.
async function soloAdmin(): Promise<boolean> {
  const sesion = await getSesion();
  return sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
}

type Resultado = { ok: boolean; error?: string; mensaje?: string };

function fallo(e: unknown): Resultado {
  return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado' };
}

export async function accionCrearDispositivo(input: {
  nombre: string;
  ip: string;
  sedeCod: string;
}): Promise<Resultado> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo administrador' };
    if (!input.nombre.trim()) return { ok: false, error: 'Ponle un nombre al equipo' };
    if (!input.ip.trim()) return { ok: false, error: 'Falta la dirección del equipo' };

    await crearDispositivo({
      nombre: input.nombre.trim(),
      ip: input.ip.trim(),
      sedeCod: input.sedeCod || null,
    });
    revalidatePath('/asistencias/huellero');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Mapea un identificador y reprocesa sus marcas históricas en el mismo paso.
 *
 * Las dos cosas van juntas a propósito: un mapeo sin reprocesar deja las marcas viejas sin
 * dueño, y es justo lo que el administrador espera que pase al mapear. Separarlo obligaría a
 * acordarse de un segundo botón.
 */
export async function accionMapear(input: {
  dispositivoId: string;
  employeeNo: string;
  empleadoId: string;
  ignorado: boolean;
  vigenteDesde: string;
  vigenteHasta: string;
  nota: string;
}): Promise<Resultado> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo administrador' };
    if (!input.ignorado && !input.empleadoId) {
      return { ok: false, error: 'Elegí un empleado, o marcá el identificador como ignorado' };
    }
    if (!input.vigenteDesde) {
      return {
        ok: false,
        error:
          'Falta la fecha desde la que vale este mapeo. El equipo reutiliza los identificadores, ' +
          'así que sin fecha las marcas de una persona pueden terminar en otra.',
      };
    }

    const id = await crearMapeo({
      dispositivoId: input.dispositivoId,
      employeeNo: input.employeeNo,
      empleadoId: input.empleadoId || null,
      ignorado: input.ignorado,
      vigenteDesde: input.vigenteDesde,
      vigenteHasta: input.vigenteHasta || null,
      nota: input.nota.trim() || null,
    });

    const r = await reprocesarMapeo(id);
    revalidatePath('/asistencias/huellero');
    revalidatePath('/asistencias');

    return {
      ok: true,
      mensaje: input.ignorado
        ? `Identificador ignorado. Se liberaron ${r.marcasLiberadas} marcas.`
        : `Mapeado. ${r.marcasAsignadas} marcas asignadas y ${r.diasRecalculados} días recalculados.`,
    };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Cierra un mapeo vigente en una fecha y recalcula.
 *
 * Es el paso obligatorio antes de mapear el mismo identificador a otra persona: el índice de
 * exclusión de la base no deja dos vigencias solapadas. Y el reproceso acá no es cosmético —
 * sin él, la persona anterior conserva los días que quedaron fuera del rango nuevo.
 */
export async function accionCerrarMapeo(input: {
  mapeoId: string;
  vigenteHasta: string;
}): Promise<Resultado> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo administrador' };
    if (!input.vigenteHasta) return { ok: false, error: 'Falta la fecha de cierre' };

    await cerrarMapeo(input.mapeoId, input.vigenteHasta);
    const r = await reprocesarMapeo(input.mapeoId);
    revalidatePath('/asistencias/huellero');
    revalidatePath('/asistencias');

    return {
      ok: true,
      mensaje:
        `Mapeo cerrado el ${input.vigenteHasta}. Se liberaron ${r.marcasLiberadas} marcas y se ` +
        `recalcularon ${r.diasRecalculados} días.`,
    };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionBorrarMapeo(mapeoId: string): Promise<Resultado> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo administrador' };
    // Se reprocesa ANTES de borrar: después de borrar la fila ya no hay a qué apuntar, y las
    // marcas quedarían asignadas a alguien que dejó de tener mapeo.
    await reprocesarMapeo(mapeoId).catch(() => undefined);
    await borrarMapeo(mapeoId);
    revalidatePath('/asistencias/huellero');
    revalidatePath('/asistencias');
    return { ok: true, mensaje: 'Mapeo borrado. Sus marcas vuelven a la cola.' };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Completa a mano la hora que falta y declara el día como trabajado.
 *
 * Usa `declararDia` y no `crearAsistencia` por dos razones. La primera es que declarar es lo que
 * hace liquidable el día: `sueldo_entrada` filtra los `sin_dato`, así que rellenar la hora sin
 * declarar dejaría el periodo bloqueado igual. La segunda es que `declararDia` actualiza la fila
 * existente **sin pisar `fuente`**: la entrada la registró el huellero y eso sigue siendo cierto
 * aunque la salida la haya puesto una persona. El trigger de auditoría de la 0072 guarda quién
 * la escribió y cuándo.
 */
export async function accionCompletarDia(input: {
  empleadoId: string;
  fecha: string;
  turno: string;
  horaEntrada: string;
  horaSalida: string;
}): Promise<Resultado> {
  try {
    if (!(await soloAdmin())) return { ok: false, error: 'Solo administrador' };
    if (!input.horaEntrada || !input.horaSalida) {
      return { ok: false, error: 'Hacen falta las dos horas para dar el día por trabajado' };
    }
    if (input.horaSalida <= input.horaEntrada) {
      return { ok: false, error: 'La salida tiene que ser posterior a la entrada' };
    }

    await declararDia({
      empleadoId: input.empleadoId,
      fecha: input.fecha,
      turno: input.turno, // el turno de la fila que ya existe, no el de día completo
      condicion: 'trabajado',
      horaEntrada: input.horaEntrada,
      horaSalida: input.horaSalida,
      tardanzaJustificada: false,
      faltaJustificada: false,
      motivoJustificacion: null,
    });

    revalidatePath('/asistencias/huellero');
    revalidatePath('/asistencias');
    return { ok: true, mensaje: 'Día completado.' };
  } catch (e) {
    return fallo(e);
  }
}
