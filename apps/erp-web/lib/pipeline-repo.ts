import type { PrendaPasada } from '@scilb/core';
import { getSupabase } from './supabase';

type Row = {
  id: string;
  activo_id: string | null;
  pedido_id: string | null;
  codigo: string;
  tipo: string | null;
  etapa: PrendaPasada['etapa'];
  sede_origen_cod: string | null;
  fecha_ingreso: string;
};

const fromRow = (r: Row): PrendaPasada => ({
  id: r.id,
  activoId: r.activo_id,
  pedidoId: r.pedido_id,
  codigo: r.codigo,
  tipo: r.tipo ?? '',
  etapa: r.etapa,
  sedeOrigenCod: r.sede_origen_cod ?? '',
  fechaIngreso: (r.fecha_ingreso ?? '').slice(0, 10),
});

// Fallback en memoria (compartido: un servicio en pedidos-repo empuja una pasada acá).
export const pasadasMemoria: PrendaPasada[] = [
  { id: 'p1', codigo: 'TN-014', tipo: 'TN', etapa: 'recepcion', sedeOrigenCod: 'LB', fechaIngreso: '2026-06-12' },
  { id: 'p2', codigo: 'SC-005', tipo: 'SC', etapa: 'refaccion', sedeOrigenCod: 'TR', fechaIngreso: '2026-06-11' },
  { id: 'p3', codigo: 'TN-002', tipo: 'TN', etapa: 'planchado', sedeOrigenCod: 'ST', fechaIngreso: '2026-06-10' },
  { id: 'p4', codigo: 'CM-008', tipo: 'CM', etapa: 'control_calidad', sedeOrigenCod: 'LB', fechaIngreso: '2026-06-09' },
];

export async function listarPasadas(): Promise<PrendaPasada[]> {
  const sb = getSupabase();
  if (!sb) return [...pasadasMemoria];
  const { data, error } = await sb.from('prenda_pasada').select('*').order('fecha_ingreso', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

// Llamado al crear un pedido de servicio: la prenda entra al pipeline interno (E5).
export async function crearPasadaDesdePedido(p: {
  codigo: string;
  tipo: string;
  sedeOrigenCod: string;
  pedidoId: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    pasadasMemoria.unshift({
      id: `p${Date.now()}`,
      codigo: p.codigo,
      tipo: p.tipo,
      etapa: 'recepcion',
      sedeOrigenCod: p.sedeOrigenCod,
      fechaIngreso: new Date().toISOString().slice(0, 10),
      pedidoId: p.pedidoId,
    });
    return;
  }
  const { error } = await sb
    .from('prenda_pasada')
    .insert({ codigo: p.codigo, tipo: p.tipo, sede_origen_cod: p.sedeOrigenCod, pedido_id: p.pedidoId, etapa: 'recepcion' });
  if (error) throw new Error(error.message);
}
