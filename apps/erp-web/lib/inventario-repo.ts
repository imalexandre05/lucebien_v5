import type { ActivoInventario, ActivoInput, InventarioRepo } from '@scilb/core';
import { getSupabase } from './supabase';

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

const supabaseRepo: InventarioRepo = {
  async listar() {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('inventario_activo').select('*').order('codigo');
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async crear(input) {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('inventario_activo').insert(toRow(input)).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  },
  async eliminar(id) {
    const sb = getSupabase()!;
    const { error } = await sb.from('inventario_activo').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// Fallback en memoria (demo sin Supabase configurado).
const datos: ActivoInventario[] = [
  { id: '1', codigo: 'TN-001', tipo: 'TN', talla: '40', color: 'Navy', sedeCod: 'LB', estado: 'disponible', precioBase: 250, precioAlquiler: 80, precioVenta: 450, usosAcumulados: 12 },
  { id: '2', codigo: 'TN-002', tipo: 'TN', talla: '38', color: 'Negro', sedeCod: 'ST', estado: 'alquilado', precioBase: 250, precioAlquiler: 80, precioVenta: 450, usosAcumulados: 3 },
  { id: '3', codigo: 'CM-008', tipo: 'CM', talla: 'M', color: 'Blanco', sedeCod: 'LB', estado: 'disponible', precioBase: 60, precioAlquiler: 20, precioVenta: 90, usosAcumulados: 1 },
];
let seq = datos.length;
const memoriaRepo: InventarioRepo = {
  async listar() {
    return [...datos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  },
  async crear(input) {
    const activo: ActivoInventario = { id: String(++seq), ...input };
    datos.push(activo);
    return activo;
  },
  async eliminar(id) {
    const i = datos.findIndex((a) => a.id === id);
    if (i >= 0) datos.splice(i, 1);
  },
};

export const inventarioRepo: InventarioRepo = getSupabase() ? supabaseRepo : memoriaRepo;
