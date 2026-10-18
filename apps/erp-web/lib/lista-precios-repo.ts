import { getServerClient } from './supabase/server';

// Lista de precios de confecciones (migración 0161). Lectura: cualquier empleado activo; escritura:
// sólo el administrador, y lo decide la RLS de la base (no un filtro de acá).

export type CategoriaPrecio = 'prenda' | 'servicio';
export type ItemPrecio = { id: string; nombre: string; categoria: CategoriaPrecio; precio: number; activo: boolean };

export async function listarListaPrecios(soloActivos = false): Promise<ItemPrecio[]> {
  const sb = getServerClient();
  let q = sb.from('lista_precios').select('id, nombre, categoria, precio, activo').order('categoria').order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  // Tabla aún sin migrar (0161 pendiente): lista vacía, la pantalla no se rompe.
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [];
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    categoria: r.categoria === 'servicio' ? 'servicio' : 'prenda',
    precio: Number(r.precio),
    activo: r.activo !== false,
  }));
}

function mensaje(e: { code?: string; message: string }): string {
  if (e.code === '23505') return 'Ya existe un artículo con ese nombre.';
  if (e.code === '42501') return 'Solo el administrador puede cambiar la lista de precios.';
  if (e.code === '23514') return 'Revisa el nombre y el precio: el precio no puede ser negativo.';
  return e.message;
}

export async function guardarItemPrecio(i: Omit<ItemPrecio, 'id'> & { id?: string }): Promise<void> {
  const sb = getServerClient();
  const fila = { nombre: i.nombre.trim(), categoria: i.categoria, precio: i.precio, activo: i.activo };
  const { error } = i.id
    ? await sb.from('lista_precios').update(fila).eq('id', i.id)
    : await sb.from('lista_precios').insert(fila);
  if (error) throw new Error(mensaje(error));
}

export async function eliminarItemPrecio(id: string): Promise<void> {
  const { error } = await getServerClient().from('lista_precios').delete().eq('id', id);
  if (error) throw new Error(mensaje(error));
}
