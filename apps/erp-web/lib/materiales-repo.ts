import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

// Materiales / insumos con stock por sede (S16). RLS por sede (0039).
export type Material = {
  id: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  sedeCod: string;
  costoPromedio: number;
  activo: boolean;
};

const COLS = 'id, nombre, categoria, unidad, stock_actual, stock_minimo, sede_cod, costo_promedio, activo';

function fromRow(r: Record<string, unknown>): Material {
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    categoria: (r.categoria as string | null) ?? null,
    unidad: String(r.unidad ?? 'unidad'),
    stockActual: Number(r.stock_actual ?? 0),
    stockMinimo: Number(r.stock_minimo ?? 0),
    sedeCod: String(r.sede_cod ?? ''),
    costoPromedio: Number(r.costo_promedio ?? 0),
    activo: Boolean(r.activo),
  };
}

export async function listarMateriales(sede?: string): Promise<Material[]> {
  const sb = getServerClient();
  let q = sb.from('materiales').select(COLS).order('nombre');
  if (sede) q = q.eq('sede_cod', sede);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
}

export type MaterialInput = {
  nombre: string;
  categoria: string | null;
  unidad: string;
  stockMinimo: number;
  sedeCod: string;
  activo: boolean;
};

export async function crearMaterial(p: MaterialInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('materiales').insert({
    nombre: p.nombre.trim(),
    categoria: p.categoria || null,
    unidad: p.unidad,
    stock_minimo: p.stockMinimo,
    sede_cod: p.sedeCod,
    activo: p.activo,
  });
  if (error) throw new Error(error.message);
}

export async function editarMaterial(id: string, p: MaterialInput): Promise<void> {
  const sb = getServerClient();
  // stock_actual y costo_promedio NO se editan a mano: solo por compras o stock_ajustar.
  const { error } = await sb
    .from('materiales')
    .update({
      nombre: p.nombre.trim(),
      categoria: p.categoria || null,
      unidad: p.unidad,
      stock_minimo: p.stockMinimo,
      sede_cod: p.sedeCod,
      activo: p.activo,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Ajuste/salida manual de stock (mermas, consumo de taller) vía RPC atómico.
export async function ajustarStock(p: {
  materialId: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  motivo: string;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('stock_ajustar', {
    p_material_id: p.materialId,
    p_tipo: p.tipo,
    p_cantidad: p.cantidad,
    p_motivo: p.motivo,
  });
  if (error) throw new Error(error.message);
}

export type MovimientoStock = {
  id: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  refTipo: string | null;
  responsableNombre: string | null;
};

export async function movimientosMaterial(materialId: string, limit = 30): Promise<MovimientoStock[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('stock_movimientos')
    .select('id, fecha, tipo, cantidad, motivo, ref_tipo, responsable_id')
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => ({
    id: String(r.id),
    fecha: String(r.fecha ?? '').slice(0, 10),
    tipo: String(r.tipo),
    cantidad: Number(r.cantidad ?? 0),
    motivo: (r.motivo as string | null) ?? null,
    refTipo: (r.ref_tipo as string | null) ?? null,
    responsableNombre: r.responsable_id ? nombre.get(String(r.responsable_id)) ?? null : null,
  }));
}
