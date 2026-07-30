import type { ActivoInventario, PedidoActivoDeActivo } from '@scilb/core';
import { inventarioRepo } from './inventario-repo';
import { getServerClient } from './supabase/server';

export type ResultadoTrazabilidad = {
  activo: ActivoInventario;
  pedido: PedidoActivoDeActivo | null;
};

type PedidoItemRow = {
  activo_id: string;
  // Fase 8: etapa_confeccion bajó de la cabecera (pedidos) a la línea (pedido_items) — un pedido
  // nuevo ya no escribe pedidos.etapa_confeccion (queda NULL), así que se lee de la propia línea
  // que la búsqueda ya está recorriendo, no del pedido anidado.
  etapa_confeccion?: string | null;
  // select('*') sobre la tabla relacionada (mismo patrón que pedidos-repo.ts): trae todas las
  // columnas reales sin nombrarlas una a una.
  pedidos: {
    tipo: string;
    estado: string;
    fecha_devolucion: string | null;
    fecha_entrega?: string | null;
    created_at: string;
    clientes: { nombre: string } | null;
  } | null;
};

// Buscador de trazabilidad (Fase 10): une inventario (Fase 8, ya trae enPipeline) + pedidos
// (Fase 9) por activo_id. La búsqueda es en memoria sobre lo que ya trae inventarioRepo.listar()
// — volumen de una boutique (cientos de activos, no millones), no justifica un índice full-text.
export async function buscarTrazabilidad(query: string): Promise<ResultadoTrazabilidad[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const activos = await inventarioRepo.listar();
  const coincide = (a: ActivoInventario) => {
    const campos = [a.codigo, a.tipo, a.talla, a.color, ...Object.values(a.atributos)];
    return campos.some((c) => c.toLowerCase().includes(q));
  };
  const encontrados = activos.filter(coincide).slice(0, 30);
  if (encontrados.length === 0) return [];

  const sb = getServerClient();
  const ids = encontrados.map((a) => a.id);
  const { data, error } = await sb
    .from('pedido_items')
    .select('activo_id, etapa_confeccion, pedidos(*, clientes(nombre))')
    .in('activo_id', ids);
  if (error) throw new Error(error.message);

  // Un activo puede tener varias pasadas por pedidos a lo largo del tiempo; nos quedamos con el
  // pedido más reciente por created_at (el que realmente describe su situación actual).
  const pedidoPorActivo = new Map<string, PedidoActivoDeActivo & { createdAt: string }>();
  for (const row of (data as unknown as PedidoItemRow[]) ?? []) {
    const p = row.pedidos;
    if (!p) continue;
    const actual = pedidoPorActivo.get(row.activo_id);
    if (actual && actual.createdAt >= p.created_at) continue;
    pedidoPorActivo.set(row.activo_id, {
      tipo: p.tipo,
      estado: p.estado,
      clienteNombre: p.clientes?.nombre ?? null,
      fechaDevolucion: p.fecha_devolucion,
      etapaConfeccion: row.etapa_confeccion ?? null,
      createdAt: p.created_at,
    });
  }

  return encontrados.map((activo) => {
    const pedido = pedidoPorActivo.get(activo.id) ?? null;
    return { activo, pedido: pedido ? { tipo: pedido.tipo, estado: pedido.estado, clienteNombre: pedido.clienteNombre, fechaDevolucion: pedido.fechaDevolucion, etapaConfeccion: pedido.etapaConfeccion } : null };
  });
}
