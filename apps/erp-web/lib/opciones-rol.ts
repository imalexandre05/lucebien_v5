import { ROL_LABEL, ROLES_BASE, type Rol } from '@scilb/core';
import type { RolDerivado } from './roles-repo';

// Opciones de rol combinadas: los 7 base + los roles derivados activos (Fase 1). Un rol derivado
// lleva su rol_base entre paréntesis porque ESE es el que manda para la RLS/alcance por sede.
// Vive fuera de los archivos 'use client' para que también la pueda llamar una página del servidor
// (/personal/usuarios): llamar desde el servidor una función de un archivo cliente rompe el render.
export type OpcionRol = { valor: string; label: string; rolBase: Rol; rolCod: string | null };

export function opcionesRol(rolesDerivados: RolDerivado[]): OpcionRol[] {
  return [
    ...ROLES_BASE.map((r) => ({ valor: r, label: ROL_LABEL[r], rolBase: r, rolCod: null })),
    ...rolesDerivados
      .filter((r) => r.activo)
      .map((r) => ({ valor: r.cod, label: `${r.nombre} (${ROL_LABEL[r.rolBase]})`, rolBase: r.rolBase, rolCod: r.cod })),
  ];
}
