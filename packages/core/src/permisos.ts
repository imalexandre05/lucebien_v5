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
}

export const SUPERVISORES: Rol[] = ['admin', 'dueno', 'encargado_tienda', 'encargado_almacen'];

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

// null = sin filtro (acceso total). Sino, lista de sedes visibles.
export function sedesPermitidas(u: Usuario): string[] | null {
  if (u.rol === 'admin' || u.rol === 'dueno') return null;
  return u.tiendas?.length ? u.tiendas : [u.sede];
}
