import type { Pedido, PedidoInput, PedidoRepo } from '@scilb/core';
import { generaPasada } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { inventarioRepo } from './inventario-repo';
import { crearPasadaDesdePedido } from './pipeline-repo';

type Row = {
  id: string;
  cliente_id: string;
  tipo: Pedido['tipo'];
  sede_cod: string | null;
  estado: Pedido['estado'];
  fecha: string;
  fecha_devolucion: string | null;
  total: number;
  created_at: string;
  clientes?: { nombre: string } | null;
  pedido_items?: { descripcion: string }[] | null;
};

const fromRow = (r: Row): Pedido => ({
  id: r.id,
  clienteId: r.cliente_id,
  clienteNombre: r.clientes?.nombre,
  tipo: r.tipo,
  sedeCod: r.sede_cod ?? '',
  estado: r.estado,
  fecha: (r.fecha ?? '').slice(0, 10),
  fechaDevolucion: r.fecha_devolucion,
  detalle: r.pedido_items?.[0]?.descripcion ?? '',
  total: Number(r.total),
  createdAt: (r.created_at ?? '').slice(0, 10),
});

const SELECT = '*, clientes(nombre), pedido_items(descripcion)';

async function detalleDe(input: PedidoInput): Promise<string> {
  if (input.activoId) {
    const activos = await inventarioRepo.listar();
    const a = activos.find((x) => x.id === input.activoId);
    if (a) return input.descripcion ? `${a.codigo} · ${input.descripcion}` : a.codigo;
  }
  return input.descripcion || (input.tipo === 'servicio' ? 'Servicio' : '—');
}

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe los pedidos
// de su sede; admin/dueño todo. El insert de pedido_items y la pasada heredan la sede
// del pedido padre (ver migración 0004_rls_comercial).
export const pedidosRepo: PedidoRepo = {
  async listar() {
    const sb = getServerClient();
    const { data, error } = await sb.from('pedidos').select(SELECT).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async porCliente(clienteId) {
    const sb = getServerClient();
    const { data, error } = await sb
      .from('pedidos')
      .select(SELECT)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async obtener(id) {
    const sb = getServerClient();
    const { data, error } = await sb.from('pedidos').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : null;
  },
  async crear(input) {
    const sb = getServerClient();
    const detalle = await detalleDe(input);
    const { data, error } = await sb
      .from('pedidos')
      .insert({
        cliente_id: input.clienteId,
        tipo: input.tipo,
        sede_cod: input.sedeCod,
        estado: 'abierto',
        fecha: input.fecha,
        fecha_devolucion: input.fechaDevolucion || null,
        total: input.total,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    const pedido = data as Row;
    await sb.from('pedido_items').insert({
      pedido_id: pedido.id,
      activo_id: input.activoId || null,
      descripcion: detalle,
      precio: input.total,
    });
    if (generaPasada(input.tipo)) {
      await crearPasadaDesdePedido({ codigo: detalle, tipo: input.tipo, sedeOrigenCod: input.sedeCod, pedidoId: pedido.id });
    }
    return { ...fromRow(pedido), detalle };
  },
};
