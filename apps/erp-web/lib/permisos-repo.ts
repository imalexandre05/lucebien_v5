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

// "Opera caja" (Fase 10, punto 4): el permiso 'pos_cobro' YA existía, pero solo era editable
// escondido en la matriz completa de /configuracion/permisos. Esto lo expone como un toggle
// directo en /empleados sin inventar una capa de permisos nueva — sigue siendo un permiso POR ROL
// (rolCod si el empleado tiene uno derivado, si no el rol base; mismo criterio que puede() en el
// core), así que activarlo/desactivarlo afecta a TODOS los que compartan ese rol, no solo a un
// empleado — la UI de /empleados lo deja explícito.
//
// `permisos_guardar_matriz` reemplaza la tabla ENTERA (delete + insert) — nunca se le manda un
// payload parcial. Por eso esto relee la matriz completa, la convierte 1:1 a filas (mismas que ya
// hay en la base, ni una de más ni de menos) y solo toca la celda [rolKey][pos_cobro] antes de
// reescribir todo — así ninguna otra fila de la matriz se pierde en el camino.
export async function togglePosCobro(rolKey: string, activar: boolean): Promise<void> {
  const matriz = await leerMatrizPermisos();
  const filas: { rol: string; modulo: string; acciones: Accion[] }[] = [];
  for (const [rol, modulos] of Object.entries(matriz)) {
    for (const [modulo, acciones] of Object.entries(modulos ?? {})) {
      filas.push({ rol, modulo, acciones: [...(acciones ?? [])] });
    }
  }
  const fila = filas.find((f) => f.rol === rolKey && f.modulo === 'pos_cobro');
  if (fila) {
    fila.acciones = activar ? Array.from(new Set([...fila.acciones, 'ver'])) : fila.acciones.filter((a) => a !== 'ver');
  } else if (activar) {
    filas.push({ rol: rolKey, modulo: 'pos_cobro', acciones: ['ver'] });
  }
  // activar=false sin fila previa: no-op (ya está desactivado, nada que reescribir).
  if (!fila && !activar) return;
  await guardarMatrizPermisos(filas);
}
