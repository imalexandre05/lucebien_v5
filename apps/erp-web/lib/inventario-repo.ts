import type { ActivoInventario, ActivoInput, InventarioRepo } from '@scilb/core';
import { getServerClient } from './supabase/server';

// snake_case (Postgres) <-> camelCase (dominio)
type Row = {
  id: string;
  codigo: string;
  tipo: string;
  talla: string | null;
  color: string | null;
  sede_cod: string | null;
  estado: ActivoInventario['estado'];
  precio_base: number;
  precio_alquiler: number;
  precio_venta: number;
  usos_acumulados: number;
};

const fromRow = (r: Row): ActivoInventario => ({
  id: r.id,
  codigo: r.codigo,
  tipo: r.tipo,
  talla: r.talla ?? '',
  color: r.color ?? '',
  sedeCod: r.sede_cod ?? '',
  estado: r.estado,
  precioBase: Number(r.precio_base),
  precioAlquiler: Number(r.precio_alquiler),
  precioVenta: Number(r.precio_venta),
  usosAcumulados: r.usos_acumulados,
});

const toRow = (i: ActivoInput) => ({
  codigo: i.codigo,
  tipo: i.tipo,
  talla: i.talla,
  color: i.color,
  sede_cod: i.sedeCod,
  estado: i.estado,
  precio_base: i.precioBase,
  precio_alquiler: i.precioAlquiler,
  precio_venta: i.precioVenta,
  usos_acumulados: i.usosAcumulados,
});

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe solo el
// inventario de su sede; admin/dueño ven todo. Reemplaza el singleton service_role (H1).
export const inventarioRepo: InventarioRepo = {
  async listar() {
    const sb = getServerClient();
    const { data, error } = await sb.from('inventario_activo').select('*').order('codigo');
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async crear(input) {
    const sb = getServerClient();
    const { data, error } = await sb.from('inventario_activo').insert(toRow(input)).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  },
  async eliminar(id) {
    const sb = getServerClient();
    const { error } = await sb.from('inventario_activo').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
