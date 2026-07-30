import type {
  Pedido,
  PedidoCrearInput,
  PedidoRepo,
  EstadoPedido,
  EtapaConfeccion,
  LineaPedido,
  Garantia,
  CobroTipo,
} from '@scilb/core';
import { getServerClient } from './supabase/server';

type ItemRow = {
  id: string;
  activo_id: string | null;
  tipo: LineaPedido['tipo'];
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  precio_lista: number | null;
  es_cortesia: boolean;
  estado: LineaPedido['estado'];
  notas: string;
  orden: number;
  devuelto_at: string | null;
  subtotal: number;
  tela: string | null;
  fecha_prueba: string | null;
  fecha_segunda_prueba: string | null;
  etapa_confeccion: EtapaConfeccion | null;
  inventario_activo?: { codigo: string } | null;
};

type GarantiaRow = {
  id: string;
  tipo: Garantia['tipo'];
  monto: number | null;
  metodo: string | null;
  documento_tipo: string | null;
  documento_num: string | null;
  estado: Garantia['estado'];
  resuelta_at: string | null;
};

type Row = {
  id: string;
  numero: number;
  codigo: string;
  cliente_id: string;
  tipo: Pedido['tipo'];
  sede_cod: string;
  estado: Pedido['estado'];
  fecha: string;
  fecha_devolucion: string | null;
  fecha_entrega: string | null;
  notas: string;
  total: number;
  cobrado: number;
  saldo: number;
  estado_pago: Pedido['estadoPago'];
  creado_por_id: string | null;
  creado_por_cod: string | null;
  created_at: string;
  clientes?: { nombre: string } | null;
  pedido_items?: ItemRow[] | null;
  pedido_garantias?: GarantiaRow[] | null;
};

const itemFromRow = (r: ItemRow): LineaPedido => ({
  id: r.id,
  activoId: r.activo_id,
  activoCodigo: r.inventario_activo?.codigo ?? null,
  tipo: r.tipo,
  descripcion: r.descripcion ?? '',
  cantidad: Number(r.cantidad),
  precioUnitario: Number(r.precio_unitario),
  precioLista: Number(r.precio_lista ?? r.precio_unitario),
  esCortesia: Boolean(r.es_cortesia),
  estado: r.estado,
  notas: r.notas ?? '',
  orden: Number(r.orden ?? 0),
  devueltoAt: r.devuelto_at,
  subtotal: Number(r.subtotal),
  tela: r.tela,
  fechaPrueba: r.fecha_prueba,
  fechaSegundaPrueba: r.fecha_segunda_prueba,
  etapaConfeccion: r.etapa_confeccion,
});

const garantiaFromRow = (r: GarantiaRow): Garantia => ({
  id: r.id,
  tipo: r.tipo,
  monto: r.monto == null ? null : Number(r.monto),
  metodo: r.metodo,
  documentoTipo: r.documento_tipo,
  documentoNum: r.documento_num,
  estado: r.estado,
  resueltaAt: r.resuelta_at,
});

function detalleDe(items: LineaPedido[]): string {
  if (items.length === 0) return '—';
  const primero = items[0];
  const base = primero.activoCodigo || primero.descripcion || '—';
  return items.length === 1 ? base : `${base} +${items.length - 1} más`;
}

const fromRow = (r: Row): Pedido => {
  const items = (r.pedido_items ?? []).map(itemFromRow).sort((a, b) => a.orden - b.orden);
  const garantia = r.pedido_garantias?.[0] ? garantiaFromRow(r.pedido_garantias[0]) : null;
  return {
    id: r.id,
    numero: Number(r.numero),
    codigo: r.codigo,
    clienteId: r.cliente_id,
    clienteNombre: r.clientes?.nombre,
    tipo: r.tipo,
    sedeCod: r.sede_cod ?? '',
    estado: r.estado,
    fecha: (r.fecha ?? '').slice(0, 10),
    fechaDevolucion: r.fecha_devolucion,
    fechaEntrega: r.fecha_entrega,
    notas: r.notas ?? '',
    total: Number(r.total),
    cobrado: Number(r.cobrado),
    saldo: Number(r.saldo),
    estadoPago: r.estado_pago,
    creadoPorId: r.creado_por_id,
    creadoPorCod: r.creado_por_cod,
    createdAt: (r.created_at ?? '').slice(0, 10),
    items,
    garantia,
    detalle: detalleDe(items),
  };
};

const SELECT = '*, clientes(nombre), pedido_items(*, inventario_activo(codigo)), pedido_garantias(*)';

// El id llega crudo desde la URL ([id] dinámico) — validar el formato UUID antes de consultar
// evita un error de Postgres feo si alguien navega a una ruta vieja.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Error tipado de las RPC de pedidos: 'PREFIJO:detalle' (mismo contrato que ReporteCrearError/
// SolicitudTransicionError). `codigo` deja que la UI trate cada prefijo del plan (SIN_CAJA,
// ACTIVO_OCUPADO, ACTIVO_EN_LAVANDERIA, COBRO_EXCEDE) sin parsear el mensaje de nuevo.
export class PedidoRpcError extends Error {
  codigo?: string;
  // Solo para ACTIVO_OCUPADO: '<codigo activo>|<codigo pedido bloqueante>'.
  activoCodigo?: string;
  pedidoBloqueanteCodigo?: string;
  constructor(message: string, codigo?: string) {
    super(message);
    this.name = 'PedidoRpcError';
    this.codigo = codigo;
    if (codigo === 'ACTIVO_OCUPADO' && message.includes('|')) {
      const [activo, pedido] = message.split('|');
      this.activoCodigo = activo;
      this.pedidoBloqueanteCodigo = pedido;
    }
  }
}

function parsearErrorPedido(error: { message?: string } | null): Error {
  const msg = error?.message ?? 'Error desconocido';
  const m = msg.match(/^([A-Z_]+):(.+)$/);
  if (m) return new PedidoRpcError(m[2], m[1]);
  return new PedidoRpcError(msg);
}

// Repo por-request con el cliente `server` (RLS): cada empleado ve/escribe los pedidos de su
// sede; admin/dueño todo. La escritura pasa por las RPC atómicas de la 0061 — nunca inserts
// sueltos (Fase 8: pedidosRepo.crear() pasaba de 3 escrituras sin transacción a esto).
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

  async crear(input: PedidoCrearInput) {
    const sb = getServerClient();
    const { data, error } = await sb.rpc('pedido_crear', {
      p_cliente: {
        id: input.cliente.id || undefined,
        nombre: input.cliente.nombre,
        dni: input.cliente.dni,
        telefono: input.cliente.telefono,
        medidas: input.cliente.medidas,
      },
      p_sede: input.sedeCod,
      p_items: input.items.map((i) => ({
        tipo: i.tipo,
        activo_id: i.activoId || undefined,
        descripcion: i.descripcion,
        cantidad: i.cantidad ?? 1,
        precio_unitario: i.precioUnitario,
        precio_lista: i.precioLista,
        es_cortesia: i.esCortesia ?? false,
        notas: i.notas,
        tela: i.tela,
        fecha_prueba: i.fechaPrueba,
        fecha_segunda_prueba: i.fechaSegundaPrueba,
        etapa_confeccion: i.etapaConfeccion,
      })),
      p_garantia: input.garantia
        ? {
            tipo: input.garantia.tipo,
            monto: input.garantia.monto,
            metodo: input.garantia.metodo,
            documento_tipo: input.garantia.documentoTipo,
            documento_num: input.garantia.documentoNum,
          }
        : { tipo: 'ninguna' },
      p_pagos: (input.pagos ?? []).map((p) => ({ monto: p.monto, metodo: p.metodo, descripcion: p.descripcion })),
      p_fecha: input.fecha || undefined,
      p_fecha_devolucion: input.fechaDevolucion || undefined,
      p_fecha_entrega: input.fechaEntrega || undefined,
      p_notas: input.notas ?? '',
      p_forzar: input.forzar ?? false,
    });
    if (error) throw parsearErrorPedido(error);
    const pedido = await this.obtener(String(data));
    if (!pedido) throw new Error('El pedido se creó pero no se pudo volver a leer');
    return pedido;
  },

  async devolver(p) {
    const sb = getServerClient();
    const { error } = await sb.rpc('pedido_devolver', {
      p_pedido_id: p.pedidoId,
      p_item_ids: p.itemIds && p.itemIds.length ? p.itemIds : null,
      p_cobro_saldo: p.cobroSaldo ? { monto: p.cobroSaldo.monto, metodo: p.cobroSaldo.metodo, descripcion: p.cobroSaldo.descripcion } : null,
      p_garantia: p.garantia ? { accion: p.garantia.accion, monto: p.garantia.monto, metodo: p.garantia.metodo } : null,
    });
    if (error) throw parsearErrorPedido(error);
  },

  async cobrar(p): Promise<CobroTipo> {
    const sb = getServerClient();
    const { data, error } = await sb.rpc('pedido_cobrar', {
      p_pedido_id: p.pedidoId,
      p_monto: p.monto,
      p_metodo: p.metodo,
      p_descripcion: p.descripcion ?? null,
    });
    if (error) throw parsearErrorPedido(error);
    return data as CobroTipo;
  },

  async anular(pedidoId, motivo) {
    const sb = getServerClient();
    const { error } = await sb.rpc('pedido_anular', { p_pedido_id: pedidoId, p_motivo: motivo ?? '' });
    if (error) throw parsearErrorPedido(error);
  },

  // Cambia la etapa de confección de UNA línea (antes vivía en la cabecera del pedido — Fase 8
  // la bajó a pedido_items porque un pedido puede llevar 2+ prendas a medida con pruebas
  // distintas). Escritura simple: no toca dinero/inventario, no necesita RPC.
  async actualizarEtapaConfeccion(itemId: string, etapa: EtapaConfeccion) {
    const sb = getServerClient();
    const { error } = await sb.from('pedido_items').update({ etapa_confeccion: etapa }).eq('id', itemId);
    if (error) throw new Error(error.message);
  },

  async cambiarEstado(id: string, estado: EstadoPedido) {
    // 'devuelto' y 'cancelado' ahora mueven dinero/inventario — deben pasar por las RPC atómicas,
    // no por un update plano de `pedidos.estado`. 'entregado'/'cerrado' son marcas sin efecto de
    // dinero/inventario y se mantienen como update directo (sigue funcionando exactamente igual
    // que antes de la Fase 8 para esos dos casos).
    if (estado === 'devuelto') {
      await this.devolver({ pedidoId: id });
      return;
    }
    if (estado === 'cancelado') {
      await this.anular(id);
      return;
    }
    const sb = getServerClient();
    const { error } = await sb.from('pedidos').update({ estado }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
