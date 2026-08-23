// El gate del módulo de colaboradores, en un solo lugar.
//
// Cada sección conserva el permiso que ya tenía su pantalla suelta. Este helper lo resuelve una vez
// y devuelve qué secciones puede ver quien está mirando, para que la navegación y las páginas usen
// la misma respuesta. Que la pestaña y la página no coincidan es cómo se cuela un acceso de más.

import { puede, type MatrizPermisos, type Sesion } from '@scilb/core';
import { getSesion } from './auth';
import { leerMatrizPermisos } from './permisos-repo';
import { SECCIONES, type ClaveSeccion } from './colaboradores-secciones';

export type Acceso = {
  sesion: Sesion;
  /** Claves de sección visibles, en el orden del catálogo. */
  secciones: ClaveSeccion[];
};

export async function accesoColaboradores(): Promise<Acceso | null> {
  const sesion = await getSesion();
  if (!sesion) return null;

  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    // Sin matriz legible se cae a lo que decida puede() con una matriz vacía, que para admin/dueño
    // sigue siendo pasar. No se abre nada: se deja que el core resuelva como siempre.
    matriz = {};
  }

  // soloAdmin es una segunda condición, no un reemplazo: la sección necesita el módulo Y —si lo
  // pide— ser admin/dueño. Sin esto, un rol no-admin con 'sueldos' o 'pagos' tildado en
  // /configuracion/permisos veía una pestaña que adentro siempre tiene el candado puesto (ROTURA
  // 3, hotfix R1.1) — ver el porqué de cada soloAdmin en colaboradores-secciones.ts.
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const secciones = SECCIONES.filter(
    (s) => (esAdmin || !s.soloAdmin) && puede(matriz, sesion.usuario.rol, s.modulo, 'ver', sesion.usuario.rolCod),
  ).map((s) => s.clave);

  return { sesion, secciones };
}
