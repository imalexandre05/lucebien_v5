import type { Pedido, PedidoInput, PedidoRepo, EstadoPedido, EtapaConfeccion } from '@scilb/core';
import { generaPasada, requiereProcesoAlDevolver } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { inventarioRepo } from './inventario-repo';
import { crearPasadaDesdePedido, reingresarActivoAPipeline } from './pipeline-repo';

type Row = {
  id: string;
  cliente_id: string;
  tipo: Pedido['tipo'];
  sede_cod: string | null;
  estado: Pedido['estado'];
  fecha: string;
  fecha_devolucion: string | null;
  fecha_entrega: string | null;
  notas: string | null;
  garantia_monto: number | null;
  tela: string | null;
  fecha_prueba: string | null;
  fecha_segunda_prueba: string | null;
  etapa_confeccion: EtapaConfeccion | null;
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
  fechaEntrega: r.fecha_entrega,
  notas: r.notas ?? '',
  garantiaMonto: Number(r.garantia_monto ?? 0),
  tela: r.tela,
  fechaPrueba: r.fecha_prueba,
  fechaSegundaPrueba: r.fecha_segunda_prueba,
  etapaConfeccion: r.etapa_confeccion,
  detalle: r.pedido_items?.[0]?.descripcion ?? '',
  total: Number(r.total),
  createdAt: (r.created_at ?? '').slice(0, 10),
});

const SELECT =
  '*, clientes(nombre), pedido_items(descripcion)';

// El id llega crudo desde la URL ([id] dinámico) — validar el formato UUID antes de consultar
// evita un error de Postgres feo si alguien navega a una ruta vieja (ej. /pedidos/nuevo, que
// ahora es un modal y ya no existe como página).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_RE.test(id)) return null;
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
        fecha_entrega: input.fechaEntrega || null,
        notas: input.notas,
        garantia_monto: input.garantiaMonto,
        tela: input.tipo === 'confeccion' ? input.tela || null : null,
        fecha_prueba: input.fechaPrueba || null,
        fecha_segunda_prueba: input.fechaSegundaPrueba || null,
        etapa_confeccion: input.tipo === 'confeccion' ? 'corte' : null,
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
  async cambiarEstado(id: string, estado: EstadoPedido) {
    const sb = getServerClient();
    const { data: ped, error: e0 } = await sb.from('pedidos').select('tipo').eq('id', id).maybeSingle();
    if (e0) throw new Error(e0.message);
    const { error } = await sb.from('pedidos').update({ estado }).eq('id', id);
    if (error) throw new Error(error.message);
    if (estado === 'devuelto' && ped && requiereProcesoAlDevolver((ped as { tipo: Pedido['tipo'] }).tipo)) {
      const { data: items, error: e1 } = await sb.from('pedido_items').select('activo_id').eq('pedido_id', id);
      if (e1) throw new Error(e1.message);
      for (const it of (items as { activo_id: string | null }[]) ?? []) {
        if (it.activo_id) await reingresarActivoAPipeline(it.activo_id);
      }
    }
  },
  async actualizarEtapaConfeccion(id: string, etapa: EtapaConfeccion) {
    const sb = getServerClient();
    const { error } = await sb.from('pedidos').update({ etapa_confeccion: etapa }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
