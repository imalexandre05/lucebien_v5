import type { PrendaPasada } from '@scilb/core';
import { getServerClient } from './supabase/server';

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

export async function listarPasadas(): Promise<PrendaPasada[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('prenda_pasada')
    .select('*')
    .order('fecha_ingreso', { ascending: false });
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
  const sb = getServerClient();
  const { error } = await sb
    .from('prenda_pasada')
    .insert({
      codigo: p.codigo,
      tipo: p.tipo,
      sede_origen_cod: p.sedeOrigenCod,
      pedido_id: p.pedidoId,
      etapa: 'recepcion',
    });
  if (error) throw new Error(error.message);
}
