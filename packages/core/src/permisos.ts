// Roles y alcance por sede. Interfaces base; la matriz de permisos concreta la inyecta el adapter.
export type Rol =
  | 'admin'
  | 'dueno'
  | 'encargado_tienda'
  | 'encargado_almacen'
  | 'confeccionista'
  | 'ventas_junior'
  | 'ventas_junior_2';

export interface Usuario {
  id: string;
  rol: Rol;
  sede: string;
  tiendas?: string[];
  // Rol derivado (Fase 1, híbrido): código de `roles.cod` cuando el admin le asignó uno propio.
  // `rol` SIGUE siendo uno de los 7 base — eso es lo que lee la RLS (private.app_es_admin() /
  // app_sedes()) y nunca cambia por tener un rol derivado. `rolCod` solo afina los permisos de
  // MÓDULO (puede()); null = el rol base manda sin capa extra.
  rolCod?: string | null;
}

export const SUPERVISORES: Rol[] = ['admin', 'dueno', 'encargado_tienda', 'encargado_almacen'];

// Los 7 roles base (fijos): la RLS depende de ellos, no se crean ni se borran desde la UI.
// Los roles derivados (tabla `roles`) heredan la seguridad de uno de estos vía `rol_base`.
export const ROLES_BASE: Rol[] = [
  'admin',
  'dueno',
  'encargado_tienda',
  'encargado_almacen',
  'confeccionista',
  'ventas_junior',
  'ventas_junior_2',
];

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  dueno: 'Dueño/a',
  encargado_tienda: 'Encargado Tienda',
  encargado_almacen: 'Enc. Almacén',
  confeccionista: 'Confeccionista',
  ventas_junior: 'Ventas Jr.',
  ventas_junior_2: 'Ventas Jr. 2',
};

export const esSupervisor = (u: Pick<Usuario, 'rol'>): boolean => SUPERVISORES.includes(u.rol);

// Genera un `cod` válido para un rol derivado (Fase 1, /configuracion/permisos) a partir del
// nombre que escribe el admin: minúsculas, sin tildes, separado por guion bajo — mismo formato
// que los 7 roles base porque comparten columna (`empleados.rol_cod`, `permisos_modulos.rol`).
// Mapa explícito de tildes/eñe (evita depender de rangos unicode de marcas combinantes, frágiles
// de escribir/leer) — suficiente para nombres en español, que es el único idioma de la UI.
const ACENTOS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
};

export function slugRol(nombre: string): string {
  const sinAcentos = nombre
    .split('')
    .map((c) => ACENTOS[c] ?? c)
    .join('');
  return sinAcentos
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// null = sin filtro (acceso total). Sino, lista de sedes visibles.
export function sedesPermitidas(u: Usuario): string[] | null {
  if (u.rol === 'admin' || u.rol === 'dueno') return null;
  return u.tiendas?.length ? u.tiendas : [u.sede];
}
