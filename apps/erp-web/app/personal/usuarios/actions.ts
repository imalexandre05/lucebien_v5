'use server';

import { revalidatePath } from 'next/cache';
import type { Rol } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { hoyPeru } from '../../../lib/fechas';
import {
  actualizarEstadoEmpleado,
  auditarAccionEmpleado,
  cambiarCodigoEmpleado,
  cambiarSedeRolEmpleado,
  generarContrasenaTemporalEmpleado,
} from '../../../lib/empleados-repo';

export type CambioUsuario = {
  id: string;
  cod?: string;
  sedeCod?: string;
  rol?: { rolBase: Rol; rolCod: string | null };
  activo?: boolean;
  restablecer?: boolean;
};
export type ResultadoUsuario = { id: string; ok: boolean; error?: string; temporal?: string };

// Solo el administrador; se vuelve a comprobar en cada RPC.
async function exigirAdmin(): Promise<void> {
  const s = await getSesion();
  if (!(s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno')) {
    throw new Error('Solo administradores pueden gestionar usuarios');
  }
}

/** Aplica los cambios persona por persona; un error en una fila no frena las demás. */
export async function accionGuardarUsuarios(
  cambios: CambioUsuario[],
): Promise<{ ok: boolean; error?: string; resultados: ResultadoUsuario[] }> {
  try {
    await exigirAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error', resultados: [] };
  }
  const codigos = cambios.map((c) => c.cod).filter((c): c is string => !!c);
  const repetidos = new Set(codigos.filter((c, i) => codigos.indexOf(c) !== i));
  const resultados: ResultadoUsuario[] = [];
  for (const c of cambios) {
    try {
      if (c.cod !== undefined) {
        if (!/^[0-9]{4}$/.test(c.cod)) throw new Error('El código debe tener 4 dígitos.');
        if (repetidos.has(c.cod)) throw new Error('Pusiste el mismo código a dos personas. Cada código es único.');
        await cambiarCodigoEmpleado(c.id, c.cod);
      }
      if (c.sedeCod !== undefined || c.rol) {
        await cambiarSedeRolEmpleado(c.id, { sedeCod: c.sedeCod, rolBase: c.rol?.rolBase, rolCod: c.rol?.rolCod });
      }
      if (c.activo !== undefined) await actualizarEstadoEmpleado(c.id, c.activo, hoyPeru());
      let temporal: string | undefined;
      if (c.restablecer) {
        temporal = await generarContrasenaTemporalEmpleado(c.id);
        await auditarAccionEmpleado(c.id, 'contraseña temporal generada');
      }
      resultados.push({ id: c.id, ok: true, temporal });
    } catch (e) {
      resultados.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : 'Error' });
    }
  }
  revalidatePath('/personal');
  revalidatePath('/personal/usuarios');
  return { ok: true, resultados };
}
