import { z } from 'zod';
import type { Rol, Usuario } from './permisos';

// Login híbrido (E2): UX cod+sede de 4 dígitos por encima de Supabase Auth.
export const loginSchema = z.object({
  sede: z.string().min(1, 'Sede requerida'),
  cod: z.string().regex(/^\d{4}$/, 'Código de 4 dígitos'),
  // El código ES la credencial (login híbrido cod+sede); no se pide contraseña aparte.
  password: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Login usuario+contraseña (LOGIN_V2): reemplaza cod+sede. `usuario` es empleados.nombre
// (case-insensitive); la contraseña real se migra desde el hash bcrypt que ya vive en
// empleados.password_hash (ver migración 0049) — no se inventa ni se pide texto plano nuevo
// salvo que el admin la reasigne desde /empleados.
export const loginUsuarioSchema = z.object({
  usuario: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
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
