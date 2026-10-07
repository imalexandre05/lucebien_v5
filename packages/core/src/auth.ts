import { z } from 'zod';
import type { Rol, Usuario } from './permisos';

// Login usuario + contraseña. `usuario` es empleados.nombre (case-insensitive). El código de 4
// dígitos dejó de ser credencial el 6-oct-2026 (spec permisos/2026-10-06-login-usuario-contrasena):
// el schema cod+sede que lo aceptaba como contraseña se eliminó. Las reglas de una contraseña
// NUEVA viven en ./acceso.ts; aquí sólo se exige que no venga vacía.
export const loginUsuarioSchema = z.object({
  usuario: z.string().trim().min(1, 'Escribe tu usuario (tu nombre).'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});
export type LoginUsuarioInput = z.infer<typeof loginUsuarioSchema>;

export interface Sesion {
  nombre: string;
  usuario: Usuario;
}

// ── Permisos: el MECANISMO vive en el core; la matriz concreta la inyecta el adapter/config. ──
export type Accion = 'ver' | 'crear' | 'editar' | 'eliminar';
// Clave por rol base (los 7 literales de `Rol`) O por `roles.cod` de un rol derivado (Fase 1) —
// ambos son strings de la misma tabla `permisos_modulos`, por eso la clave se abre a `string`.
export type MatrizPermisos = Partial<Record<string, Partial<Record<string, Accion[]>>>>;

// admin y dueno tienen acceso total (regla portada del ERP viejo). El resto, según matriz.
// `rolCod` (Fase 1, roles derivados): si el empleado tiene un rol derivado y ESE rol tiene una
// fila configurada para `modulo` (aunque sea un array vacío = "sin acciones"), manda esa fila.
// Si el rol derivado nunca se configuró para ese módulo (sin fila), cae al rol base — así un rol
// derivado solo necesita declarar las DIFERENCIAS respecto de su base, no copiar todo.
export function puede(
  matriz: MatrizPermisos,
  rol: Rol,
  modulo: string,
  accion: Accion,
  rolCod?: string | null,
): boolean {
  if (rol === 'admin' || rol === 'dueno') return true;
  if (rolCod) {
    const filaCod = matriz[rolCod]?.[modulo];
    if (filaCod) return filaCod.includes(accion);
  }
  return matriz[rol]?.[modulo]?.includes(accion) ?? false;
}
