import type { MatrizPermisos, Accion, Rol } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Matriz de permisos configurable por rol (Fase 4). Reemplaza el placeholder hardcodeado del
// adapter — el mecanismo de evaluación (puede()) vive en el core sin cambios, esto solo cambia
// de dónde sale la matriz. admin/dueno no tienen filas (puede() los deja pasar siempre).
export async function leerMatrizPermisos(): Promise<MatrizPermisos> {
  const sb = getServerClient();
  const { data, error } = await sb.from('permisos_modulos').select('rol, modulo, acciones');
  if (error) throw new Error(error.message);
  const matriz: MatrizPermisos = {};
  for (const r of (data as { rol: Rol; modulo: string; acciones: Accion[] }[]) ?? []) {
    matriz[r.rol] = { ...matriz[r.rol], [r.modulo]: r.acciones };
  }
  return matriz;
}

// Reemplaza TODA la matriz (borra + inserta) desde el editor de Configuración. Simple y atómico
// para una tabla chica que solo edita el admin ocasionalmente.
export async function guardarMatrizPermisos(filas: { rol: Rol; modulo: string; acciones: Accion[] }[]): Promise<void> {
  const sb = getServerClient();
  const { error: delErr } = await sb.from('permisos_modulos').delete().neq('rol', '__nunca__');
  if (delErr) throw new Error(delErr.message);
  const conAcciones = filas.filter((f) => f.acciones.length > 0);
  if (conAcciones.length === 0) return;
  const { error } = await sb.from('permisos_modulos').insert(conAcciones);
  if (error) throw new Error(error.message);
}
