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
  atributos: Record<string, string> | null;
  publicable: boolean | null;
  descripcion_publica: string | null;
};

type PasadaActivaRow = { id: string; activo_id: string | null; etapa: string };

const fromRow = (r: Row, enPipeline: ActivoInventario['enPipeline']): ActivoInventario => ({
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
  atributos: r.atributos ?? {},
  publicable: Boolean(r.publicable),
  descripcionPublica: r.descripcion_publica ?? '',
  enPipeline,
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
  atributos: i.atributos,
  publicable: i.publicable,
  descripcion_publica: i.descripcionPublica,
});

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe solo el
// inventario de su sede; admin/dueño ven todo. Reemplaza el singleton service_role (H1).
export const inventarioRepo: InventarioRepo = {
  async listar() {
    const sb = getServerClient();
    const [{ data, error }, pasadasRes] = await Promise.all([
      sb.from('inventario_activo').select('*').order('codigo'),
      // Trazabilidad (Fase 8): el vínculo prenda_pasada.activo_id → inventario_activo.id ya
      // existía en el esquema (E5) pero nadie lo consultaba. Una prenda "en pipeline" es la
      // que tiene una pasada activa (no 'enviado' — esa ya está en tienda, terminó su recorrido).
      sb.from('prenda_pasada').select('id, activo_id, etapa').not('activo_id', 'is', null).neq('etapa', 'enviado'),
    ]);
    if (error) throw new Error(error.message);
    if (pasadasRes.error) throw new Error(pasadasRes.error.message);

    const pipelinePorActivo = new Map<string, { pasadaId: string; etapa: string }>();
    for (const p of (pasadasRes.data as PasadaActivaRow[]) ?? []) {
      if (p.activo_id) pipelinePorActivo.set(p.activo_id, { pasadaId: p.id, etapa: p.etapa });
    }

    return (data as Row[]).map((r) => fromRow(r, pipelinePorActivo.get(r.id) ?? null));
  },
  async crear(input) {
    const sb = getServerClient();
    const { data, error } = await sb.from('inventario_activo').insert(toRow(input)).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row, null);
  },
  async editar(id, input) {
    const sb = getServerClient();
    const { data, error } = await sb.from('inventario_activo').update(toRow(input)).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row, null);
  },
  async eliminar(id) {
    const sb = getServerClient();
    const { error } = await sb.from('inventario_activo').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
