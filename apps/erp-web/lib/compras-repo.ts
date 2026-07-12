import { totalCompra } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

// Compras de material (S16). Cabecera + ítems; recepción/anulación vía RPC atómico (0039).
export type CompraItem = {
  materialId: string;
  materialNombre?: string;
  cantidad: number;
  costoUnitario: number;
};

export type Compra = {
  id: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  fecha: string;
  estado: 'pendiente' | 'recibida' | 'anulada';
  total: number;
  sedeCod: string;
  responsableNombre: string | null;
  obs: string | null;
  items: CompraItem[];
};

export async function listarCompras(limit = 100): Promise<Compra[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('compras')
    .select(
      'id, proveedor_id, fecha, estado, total, sede_cod, responsable_id, obs, ' +
        'proveedores(nombre), compra_items(material_id, cantidad, costo_unitario, materiales(nombre))',
    )
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => ({
    id: String(r.id),
    proveedorId: (r.proveedor_id as string | null) ?? null,
    proveedorNombre: (r.proveedores as { nombre: string } | null)?.nombre ?? null,
    fecha: String(r.fecha ?? '').slice(0, 10),
    estado: (r.estado as Compra['estado']) ?? 'pendiente',
    total: Number(r.total ?? 0),
    sedeCod: String(r.sede_cod ?? ''),
    responsableNombre: r.responsable_id ? nombre.get(String(r.responsable_id)) ?? null : null,
    obs: (r.obs as string | null) ?? null,
    items: ((r.compra_items as Record<string, unknown>[]) ?? []).map((i) => ({
      materialId: String(i.material_id),
      materialNombre: (i.materiales as { nombre: string } | null)?.nombre ?? undefined,
      cantidad: Number(i.cantidad ?? 0),
      costoUnitario: Number(i.costo_unitario ?? 0),
    })),
  }));
}

export async function crearCompra(p: {
  proveedorId: string | null;
  sedeCod: string;
  obs: string | null;
  items: { materialId: string; cantidad: number; costoUnitario: number }[];
}): Promise<void> {
  const sb = getServerClient();
  const { data: u } = await sb.auth.getUser();
  const total = totalCompra(p.items.map((i) => ({ cantidad: i.cantidad, costoUnitario: i.costoUnitario })));
  const { data: compra, error } = await sb
    .from('compras')
    .insert({
      proveedor_id: p.proveedorId,
      sede_cod: p.sedeCod,
      obs: p.obs,
      total,
      estado: 'pendiente',
      responsable_id: u?.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const { error: eItems } = await sb.from('compra_items').insert(
    p.items.map((i) => ({
      compra_id: compra.id,
      material_id: i.materialId,
      cantidad: i.cantidad,
      costo_unitario: i.costoUnitario,
    })),
  );
  if (eItems) throw new Error(eItems.message);
}

// Recibir: sube stock y recalcula costo promedio (RPC atómico).
export async function recibirCompra(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('compra_recibir', { p_compra_id: id });
  if (error) throw new Error(error.message);
}

// Anular: si estaba recibida, revierte los movimientos de stock (RPC atómico).
export async function anularCompra(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('compra_anular', { p_compra_id: id });
  if (error) throw new Error(error.message);
}
