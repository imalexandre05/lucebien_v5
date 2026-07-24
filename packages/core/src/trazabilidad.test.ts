import { describe, it, expect } from 'vitest';
import { estadoTrazabilidad, type PedidoActivoDeActivo } from './trazabilidad';

const pedido = (p: Partial<PedidoActivoDeActivo>): PedidoActivoDeActivo => ({
  tipo: 'alquiler',
  estado: 'entregado',
  clienteNombre: 'Juan Pérez',
  fechaDevolucion: null,
  etapaConfeccion: null,
  ...p,
});

describe('estadoTrazabilidad', () => {
  it('baja tiene prioridad sobre cualquier otra cosa', () => {
    expect(estadoTrazabilidad({ estadoActivo: 'baja', enPipeline: { etapa: 'lavado' }, pedido: null })).toEqual({ tipo: 'baja' });
  });

  it('confección en curso prevalece sobre el pipeline de lavandería', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'disponible',
      enPipeline: { etapa: 'lavado' },
      pedido: pedido({ tipo: 'confeccion', estado: 'abierto', etapaConfeccion: 'armado' }),
    });
    expect(r).toEqual({ tipo: 'en_confeccion', etapa: 'armado' });
  });

  it('un pedido de confección cerrado ya no cuenta como en curso', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'disponible',
      enPipeline: null,
      pedido: pedido({ tipo: 'confeccion', estado: 'cerrado', etapaConfeccion: 'entrega' }),
    });
    expect(r).toEqual({ tipo: 'disponible' });
  });

  it('en pipeline de lavandería prevalece sobre alquilado/vendido', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'en_lavanderia',
      enPipeline: { etapa: 'compostura' },
      pedido: pedido({ tipo: 'alquiler', estado: 'entregado' }),
    });
    expect(r).toEqual({ tipo: 'en_pipeline', etapa: 'compostura' });
  });

  it('alquiler entregado sin pipeline activo se marca alquilado', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'alquilado',
      enPipeline: null,
      pedido: pedido({ tipo: 'alquiler', estado: 'entregado', fechaDevolucion: '2026-08-01' }),
    });
    expect(r).toEqual({ tipo: 'alquilado', clienteNombre: 'Juan Pérez', fechaDevolucion: '2026-08-01' });
  });

  it('alquiler todavía abierto (no entregado) no se marca alquilado', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'disponible',
      enPipeline: null,
      pedido: pedido({ tipo: 'alquiler', estado: 'abierto' }),
    });
    expect(r).toEqual({ tipo: 'disponible' });
  });

  it('venta entregada se marca vendido', () => {
    const r = estadoTrazabilidad({
      estadoActivo: 'disponible',
      enPipeline: null,
      pedido: pedido({ tipo: 'venta', estado: 'entregado', clienteNombre: 'María Ríos' }),
    });
    expect(r).toEqual({ tipo: 'vendido', clienteNombre: 'María Ríos' });
  });

  it('sin pedido activo ni pipeline, disponible en tienda', () => {
    expect(estadoTrazabilidad({ estadoActivo: 'disponible', enPipeline: null, pedido: null })).toEqual({ tipo: 'disponible' });
  });
});
