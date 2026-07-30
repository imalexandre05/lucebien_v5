import { describe, it, expect } from 'vitest';
import {
  generaPasada,
  requiereProcesoAlDevolver,
  pedidoSchema,
  pedidoCrearSchema,
  garantiaInputSchema,
  totalPedido,
  totalPorTipoLinea,
  tipoDominante,
  clasificarCobro,
  estadoPago,
} from './pedidos';

describe('generaPasada (comercial ↔ pipeline)', () => {
  it('solo un servicio genera pasada en el pipeline interno', () => {
    expect(generaPasada('servicio')).toBe(true);
    expect(generaPasada('alquiler')).toBe(false);
    expect(generaPasada('venta')).toBe(false);
    expect(generaPasada('confeccion')).toBe(false);
  });
});

describe('requiereProcesoAlDevolver (alquiler devuelto → pipeline)', () => {
  it('solo un alquiler devuelto reingresa al pipeline', () => {
    expect(requiereProcesoAlDevolver('alquiler')).toBe(true);
    expect(requiereProcesoAlDevolver('venta')).toBe(false);
    expect(requiereProcesoAlDevolver('servicio')).toBe(false);
    expect(requiereProcesoAlDevolver('confeccion')).toBe(false);
  });
});

describe('pedidoSchema (compat retro — modal de un solo ítem)', () => {
  const base = { clienteId: 'c1', tipo: 'venta' as const, sedeCod: 'LB', fecha: '2026-07-01' };

  it('acepta un pedido válido y aplica defaults', () => {
    const r = pedidoSchema.parse(base);
    expect(r.total).toBe(0);
    expect(r.descripcion).toBe('');
    expect(r.activoId).toBe('');
    expect(r.notas).toBe('');
    expect(r.garantiaMonto).toBe(0);
    expect(r.tela).toBe('');
  });
  it('coacciona total y garantiaMonto de string a número', () => {
    const r = pedidoSchema.parse({ ...base, total: '150.5', garantiaMonto: '80' });
    expect(r.total).toBe(150.5);
    expect(r.garantiaMonto).toBe(80);
  });
  it('rechaza sin cliente o con tipo inválido', () => {
    expect(() => pedidoSchema.parse({ ...base, clienteId: '' })).toThrow();
    expect(() => pedidoSchema.parse({ ...base, tipo: 'x' })).toThrow();
  });
  it('rechaza total negativo', () => {
    expect(() => pedidoSchema.parse({ ...base, total: -5 })).toThrow();
  });
});

describe('totalPedido (Σ subtotal de líneas no canceladas, cortesía forzada a 0)', () => {
  it('suma cantidad × precioUnitario de las líneas activas', () => {
    expect(
      totalPedido([
        { cantidad: 1, precioUnitario: 150 },
        { cantidad: 2, precioUnitario: 20 },
      ]),
    ).toBe(190);
  });
  it('una cortesía nunca suma, aunque venga con precioUnitario mal puesto', () => {
    expect(totalPedido([{ cantidad: 1, precioUnitario: 100, esCortesia: true }])).toBe(0);
  });
  it('excluye las líneas canceladas', () => {
    expect(
      totalPedido([
        { cantidad: 1, precioUnitario: 100, estado: 'activo' },
        { cantidad: 1, precioUnitario: 999, estado: 'cancelado' },
      ]),
    ).toBe(100);
  });
  it('las líneas devueltas SÍ suman (se pagaron, solo volvió la prenda)', () => {
    expect(totalPedido([{ cantidad: 1, precioUnitario: 80, estado: 'devuelto' }])).toBe(80);
  });
  it('redondea a 2 decimales', () => {
    expect(totalPedido([{ cantidad: 3, precioUnitario: 10.005 }])).toBe(30.02);
  });
});

describe('tipoDominante (tipo de cabecera derivado)', () => {
  it('un solo tipo entre las líneas activas → ese tipo', () => {
    expect(tipoDominante([{ tipo: 'alquiler' }, { tipo: 'alquiler' }])).toBe('alquiler');
  });
  it('más de un tipo entre las líneas activas → mixto', () => {
    expect(tipoDominante([{ tipo: 'alquiler' }, { tipo: 'venta' }])).toBe('mixto');
  });
  it('ignora las líneas canceladas al derivar', () => {
    expect(tipoDominante([{ tipo: 'alquiler' }, { tipo: 'venta', estado: 'cancelado' }])).toBe('alquiler');
  });
  it('sin líneas activas, no hay tipo que derivar (null — el llamador decide)', () => {
    expect(tipoDominante([{ tipo: 'venta', estado: 'cancelado' }])).toBeNull();
    expect(tipoDominante([])).toBeNull();
  });
});

describe('clasificarCobro (adelanto/saldo/completo)', () => {
  it('cubre el total desde cero → completo', () => {
    expect(clasificarCobro(100, 0, 100)).toBe('completo');
    expect(clasificarCobro(100, 0, 150)).toBe('completo');
  });
  it('no cubre el total → siempre adelanto, sin preguntar', () => {
    expect(clasificarCobro(100, 0, 60)).toBe('adelanto');
    expect(clasificarCobro(100, 60, 10)).toBe('adelanto');
  });
  it('había cobro previo y este pago cierra el total → saldo', () => {
    expect(clasificarCobro(100, 60, 40)).toBe('saldo');
  });
});

describe('estadoPago (derivado de total/cobrado — mismo criterio que la columna generada)', () => {
  it('total <= 0 siempre es completo (ej. pedido 100% cortesía)', () => {
    expect(estadoPago(0, 0)).toBe('completo');
  });
  it('cobrado <= 0 con total > 0 → pendiente', () => {
    expect(estadoPago(100, 0)).toBe('pendiente');
  });
  it('cobrado >= total → completo', () => {
    expect(estadoPago(100, 100)).toBe('completo');
    expect(estadoPago(100, 120)).toBe('completo');
  });
  it('0 < cobrado < total → parcial', () => {
    expect(estadoPago(100, 40)).toBe('parcial');
  });
});

describe('pedidoCrearSchema (validación Zod del payload real de pedido_crear)', () => {
  const base = {
    cliente: { nombre: 'Juan Pérez' },
    sedeCod: 'LB',
    items: [{ tipo: 'alquiler' as const, precioUnitario: 100 }],
  };

  it('acepta el mínimo válido y aplica defaults', () => {
    const r = pedidoCrearSchema.parse(base);
    expect(r.items[0].cantidad).toBe(1);
    expect(r.items[0].esCortesia).toBe(false);
    expect(r.pagos).toEqual([]);
    expect(r.forzar).toBe(false);
  });
  it('rechaza sin ítems', () => {
    expect(() => pedidoCrearSchema.parse({ ...base, items: [] })).toThrow();
  });
  it('rechaza sin nombre de cliente', () => {
    expect(() => pedidoCrearSchema.parse({ ...base, cliente: { nombre: '' } })).toThrow();
  });
  it('acepta varias líneas de distinto tipo (pedido mixto)', () => {
    const r = pedidoCrearSchema.parse({
      ...base,
      items: [
        { tipo: 'alquiler', precioUnitario: 150 },
        { tipo: 'venta', precioUnitario: 40 },
        { tipo: 'alquiler', precioUnitario: 0, esCortesia: true },
      ],
    });
    expect(r.items).toHaveLength(3);
    expect(r.items[2].esCortesia).toBe(true);
  });
});

describe('garantiaInputSchema (polimórfica efectivo|documento|ninguna)', () => {
  it('acepta ninguna sin más datos', () => {
    expect(garantiaInputSchema.parse({ tipo: 'ninguna' }).tipo).toBe('ninguna');
  });
  it('acepta efectivo con monto', () => {
    const r = garantiaInputSchema.parse({ tipo: 'efectivo', monto: 100, metodo: 'efectivo' });
    expect(r.monto).toBe(100);
  });
  it('exige documentoTipo + documentoNum para tipo documento', () => {
    expect(() => garantiaInputSchema.parse({ tipo: 'documento' })).toThrow();
    expect(garantiaInputSchema.parse({ tipo: 'documento', documentoTipo: 'dni', documentoNum: '12345678' }).tipo).toBe('documento');
  });
});

describe('totalPorTipoLinea (Fase 9 — fix del KPI que perdía los pedidos mixto)', () => {
  it('agrupa por LÍNEA, no por cabecera: un pedido mixto reparte su total entre sus tipos', () => {
    const r = totalPorTipoLinea([
      { tipo: 'alquiler', subtotal: 180 },
      { tipo: 'venta', subtotal: 20 },
    ]);
    expect(r.alquiler).toBe(180);
    expect(r.venta).toBe(20);
    expect(r.servicio).toBe(0);
    expect(r.confeccion).toBe(0);
  });
  it('devuelve los 4 tipos en 0 con una lista vacía (nunca undefined)', () => {
    expect(totalPorTipoLinea([])).toEqual({ alquiler: 0, venta: 0, servicio: 0, confeccion: 0 });
  });
  it('suma varias líneas del mismo tipo entre distintos pedidos', () => {
    const r = totalPorTipoLinea([
      { tipo: 'venta', subtotal: 40 },
      { tipo: 'venta', subtotal: 60 },
    ]);
    expect(r.venta).toBe(100);
  });
  it('excluye las líneas canceladas', () => {
    const r = totalPorTipoLinea([
      { tipo: 'alquiler', subtotal: 100, estado: 'activo' },
      { tipo: 'alquiler', subtotal: 999, estado: 'cancelado' },
    ]);
    expect(r.alquiler).toBe(100);
  });
  it('una cortesía (subtotal ya en 0) no aporta al total de su tipo', () => {
    const r = totalPorTipoLinea([{ tipo: 'venta', subtotal: 0, estado: 'activo' }]);
    expect(r.venta).toBe(0);
  });
  it('redondea a 2 decimales', () => {
    const r = totalPorTipoLinea([
      { tipo: 'servicio', subtotal: 10.005 },
      { tipo: 'servicio', subtotal: 10.005 },
    ]);
    expect(r.servicio).toBe(20.02);
  });
});
