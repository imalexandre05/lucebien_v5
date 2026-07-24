// Trazabilidad del terno (Fase 10): un solo estado derivado que reúne inventario (Fase 8),
// pipeline de lavandería (Fase 5) y pedidos (Fase 9) — el buscador solo necesita esto para
// mostrar "dónde está" y "en qué proceso" sin repetir la lógica de prioridad en cada vista.
export type EstadoTrazabilidad =
  | { tipo: 'baja' }
  | { tipo: 'en_confeccion'; etapa: string | null }
  | { tipo: 'en_pipeline'; etapa: string }
  | { tipo: 'alquilado'; clienteNombre: string | null; fechaDevolucion: string | null }
  | { tipo: 'vendido'; clienteNombre: string | null }
  | { tipo: 'disponible' };

export type PedidoActivoDeActivo = {
  tipo: string;
  estado: string;
  clienteNombre: string | null;
  fechaDevolucion: string | null;
  etapaConfeccion: string | null;
};

// Prioridad (de más a menos específico): baja > confección en curso > proceso de lavandería >
// alquilado en la calle > vendido y entregado > disponible en tienda. Un activo "en confección"
// aún no completada prevalece sobre cualquier otra lectura porque literalmente no existe todavía
// como prenda terminada.
export function estadoTrazabilidad(input: {
  estadoActivo: string;
  enPipeline: { etapa: string } | null;
  pedido: PedidoActivoDeActivo | null;
}): EstadoTrazabilidad {
  if (input.estadoActivo === 'baja') return { tipo: 'baja' };

  const pedidoActivo = input.pedido && input.pedido.estado !== 'cerrado' && input.pedido.estado !== 'cancelado' ? input.pedido : null;

  if (pedidoActivo?.tipo === 'confeccion') {
    return { tipo: 'en_confeccion', etapa: pedidoActivo.etapaConfeccion };
  }
  if (input.enPipeline) return { tipo: 'en_pipeline', etapa: input.enPipeline.etapa };
  if (pedidoActivo?.tipo === 'alquiler' && pedidoActivo.estado === 'entregado') {
    return { tipo: 'alquilado', clienteNombre: pedidoActivo.clienteNombre, fechaDevolucion: pedidoActivo.fechaDevolucion };
  }
  if (pedidoActivo?.tipo === 'venta' && pedidoActivo.estado === 'entregado') {
    return { tipo: 'vendido', clienteNombre: pedidoActivo.clienteNombre };
  }
  return { tipo: 'disponible' };
}
