import { getServerClient } from './supabase/server';

// Catálogo de tipos de producto (Fase 7, migración 0055). `inventario_activo.tipo` SIGUE siendo
// texto libre — este catálogo solo sugiere `prefijo` (para el código TN-042) y `atributosSugeridos`
// (claves a pre-cargar en el editor de atributos libres, ver app/inventario/cliente.tsx). Nunca
// restringe ni valida lo que ya hay guardado.
export type ProductoTipo = {
  cod: string;
  nombre: string;
  prefijo: string;
  atributosSugeridos: string[];
  activo: boolean;
};

export type ProductoTipoInput = {
  cod: string;
  nombre: string;
  prefijo: string;
  atributosSugeridos: string[];
};

type Row = {
  cod: string;
  nombre: string;
  prefijo: string;
  atributos_sugeridos: string[] | null;
  activo: boolean | null;
};

const fromRow = (r: Row): ProductoTipo => ({
  cod: r.cod,
  nombre: r.nombre,
  prefijo: r.prefijo,
  atributosSugeridos: Array.isArray(r.atributos_sugeridos) ? r.atributos_sugeridos : [],
  activo: r.activo ?? true,
});

// Código de relación de Postgres para "la tabla/relación no existe" (migración 0055 pendiente).
// Igual que en otros repos de este proyecto: se degrada a "sin catálogo" en vez de tumbar la
// página — /inventario y /configuracion/tipos-producto siguen funcionando sin el catálogo.
function esTablaInexistente(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

export async function listarTiposProducto(soloActivos = false): Promise<ProductoTipo[]> {
  const sb = getServerClient();
  let query = sb.from('producto_tipos').select('*').order('nombre');
  if (soloActivos) query = query.eq('activo', true);
  const { data, error } = await query;
  if (error) {
    if (esTablaInexistente(error)) return [];
    throw new Error(error.message);
  }
  return (data as Row[]).map(fromRow);
}

export async function crearTipoProducto(input: ProductoTipoInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('producto_tipos').insert({
    cod: input.cod,
    nombre: input.nombre,
    prefijo: input.prefijo.toUpperCase(),
    atributos_sugeridos: input.atributosSugeridos,
  });
  if (error) throw new Error(error.message);
}

export async function editarTipoProducto(cod: string, input: ProductoTipoInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('producto_tipos')
    .update({
      nombre: input.nombre,
      prefijo: input.prefijo.toUpperCase(),
      atributos_sugeridos: input.atributosSugeridos,
    })
    .eq('cod', cod);
  if (error) throw new Error(error.message);
}

export async function activarTipoProducto(cod: string, activo: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('producto_tipos').update({ activo }).eq('cod', cod);
  if (error) throw new Error(error.message);
}

export async function eliminarTipoProducto(cod: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('producto_tipos').delete().eq('cod', cod);
  if (error) throw new Error(error.message);
}
