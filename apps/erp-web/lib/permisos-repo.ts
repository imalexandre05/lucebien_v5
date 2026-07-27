import type { MatrizPermisos, Accion } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Matriz de permisos configurable por rol o por rol derivado (Fase 1/4). El mecanismo de
// evaluación (puede()) vive en el core sin cambios; esto solo cambia de dónde sale la matriz.
// admin/dueno no tienen filas (puede() los deja pasar siempre). La clave `rol` de cada fila puede
// ser uno de los 7 roles base O el `cod` de un rol derivado (misma columna, ver migración 0050).
export async function leerMatrizPermisos(): Promise<MatrizPermisos> {
  const sb = getServerClient();
  const { data, error } = await sb.from('permisos_modulos').select('rol, modulo, acciones');
  if (error) throw new Error(error.message);
  const matriz: MatrizPermisos = {};
  for (const r of (data as { rol: string; modulo: string; acciones: Accion[] }[]) ?? []) {
    matriz[r.rol] = { ...matriz[r.rol], [r.modulo]: r.acciones };
  }
  return matriz;
}

// Reemplaza TODA la matriz vía la RPC permisos_guardar_matriz (migración 0050) — atómica, a
// diferencia del delete+insert anterior (dos idas de red sin transacción). Se guardan TODAS las
// filas que mande el editor, incluidas acciones=[] explícitas: para un rol derivado eso significa
// "revocado" (no lo mismo que "sin configurar, hereda del rol base" — ver puede() en el core).
export async function guardarMatrizPermisos(filas: { rol: string; modulo: string; acciones: Accion[] }[]): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('permisos_guardar_matriz', { p_filas: filas });
  if (error) throw new Error(error.message);
}
