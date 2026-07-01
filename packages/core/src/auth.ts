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

export interface Sesion {
  nombre: string;
  usuario: Usuario;
}

// ── Permisos: el MECANISMO vive en el core; la matriz concreta la inyecta el adapter/config. ──
export type Accion = 'ver' | 'crear' | 'editar' | 'eliminar';
export type MatrizPermisos = Partial<Record<Rol, Partial<Record<string, Accion[]>>>>;

// admin y dueno tienen acceso total (regla portada del ERP viejo). El resto, según matriz.
export function puede(matriz: MatrizPermisos, rol: Rol, modulo: string, accion: Accion): boolean {
  if (rol === 'admin' || rol === 'dueno') return true;
  return matriz[rol]?.[modulo]?.includes(accion) ?? false;
}
