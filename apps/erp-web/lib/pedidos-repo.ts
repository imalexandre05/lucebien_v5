import type { Pedido, PedidoInput, PedidoRepo } from '@scilb/core';
import { generaPasada } from '@scilb/core';
import { getSupabase } from './supabase';
import { inventarioRepo } from './inventario-repo';
import { clientesRepo } from './clientes-repo';
import { crearPasadaDesdePedido, pasadasMemoria } from './pipeline-repo';

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

const supabaseRepo: PedidoRepo = {
  async listar() {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('pedidos').select(SELECT).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async porCliente(clienteId) {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('pedidos').select(SELECT).eq('cliente_id', clienteId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  },
  async obtener(id) {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('pedidos').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : null;
  },
  async crear(input) {
    const sb = getSupabase()!;
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

// ── Fallback en memoria ──
const datos: Pedido[] = [
  { id: '1', clienteId: '1', clienteNombre: 'Juan Pérez', tipo: 'alquiler', sedeCod: 'LB', estado: 'abierto', fecha: '2026-06-10', fechaDevolucion: '2026-06-13', detalle: 'TN-001', total: 80, createdAt: '2026-06-10' },
  { id: '2', clienteId: '2', clienteNombre: 'María Quispe', tipo: 'venta', sedeCod: 'ST', estado: 'cerrado', fecha: '2026-06-08', detalle: 'CM-008', total: 90, createdAt: '2026-06-08' },
];
let seq = datos.length;

const memoriaRepo: PedidoRepo = {
  async listar() {
    return [...datos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async porCliente(clienteId) {
    return datos.filter((p) => p.clienteId === clienteId);
  },
  async obtener(id) {
    return datos.find((p) => p.id === id) ?? null;
  },
  async crear(input) {
    const detalle = await detalleDe(input);
    const clientes = await clientesRepo.listar();
    const cliente = clientes.find((c) => c.id === input.clienteId);
    const pedido: Pedido = {
      id: String(++seq),
      clienteId: input.clienteId,
      clienteNombre: cliente?.nombre,
      tipo: input.tipo,
      sedeCod: input.sedeCod,
      estado: 'abierto',
      fecha: input.fecha,
      fechaDevolucion: input.fechaDevolucion || null,
      detalle,
      total: input.total,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    datos.unshift(pedido);
    if (generaPasada(input.tipo)) {
      pasadasMemoria.unshift({
        id: `p${Date.now()}`,
        codigo: detalle,
        tipo: input.tipo,
        etapa: 'recepcion',
        sedeOrigenCod: input.sedeCod,
        fechaIngreso: pedido.createdAt,
        pedidoId: pedido.id,
      });
    }
    return pedido;
  },
};

export const pedidosRepo: PedidoRepo = getSupabase() ? supabaseRepo : memoriaRepo;
