import { describe, it, expect } from 'vitest';
import {
  diasEntre,
  alertasDevoluciones,
  alertasStock,
  alertasCajaSinCerrar,
  alertasReportesSinEvaluar,
  ordenarAlertas,
  type Alerta,
} from './alertas';

const HOY = '2026-07-12';

describe('diasEntre', () => {
  it('positivo hacia el futuro, negativo al pasado', () => {
    expect(diasEntre(HOY, '2026-07-15')).toBe(3);
    expect(diasEntre(HOY, '2026-07-10')).toBe(-2);
    expect(diasEntre(HOY, HOY)).toBe(0);
  });
});

describe('alertasDevoluciones', () => {
  it('marca vencidas como críticas y próximas como warn', () => {
    const a = alertasDevoluciones(
      [
        { id: '1', fechaDevolucion: '2026-07-10', estado: 'entregado', cliente: 'Ana' }, // vencida
        { id: '2', fechaDevolucion: '2026-07-13', estado: 'abierto' }, // próxima (mañana)
        { id: '3', fechaDevolucion: '2026-07-20', estado: 'entregado' }, // futura, no alerta
      ],
      HOY,
    );
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ tipo: 'devolucion_vencida', severidad: 'critica', refId: '1' });
    expect(a[1]).toMatchObject({ tipo: 'devolucion_proxima', severidad: 'warn', refId: '2' });
  });
  it('ignora pedidos ya devueltos/cerrados o sin fecha', () => {
    const a = alertasDevoluciones(
      [
        { id: '1', fechaDevolucion: '2026-07-01', estado: 'devuelto' },
        { id: '2', fechaDevolucion: null, estado: 'abierto' },
      ],
      HOY,
    );
    expect(a).toEqual([]);
  });
  it('"hoy" se reporta como próxima', () => {
    const a = alertasDevoluciones([{ id: '1', fechaDevolucion: HOY, estado: 'abierto' }], HOY);
    expect(a[0]).toMatchObject({ severidad: 'warn' });
    expect(a[0].mensaje).toContain('hoy');
  });
});

describe('alertasStock', () => {
  it('alerta solo materiales activos bajo mínimo', () => {
    const a = alertasStock([
      { id: 'm1', nombre: 'Tela azul', stockActual: 2, stockMinimo: 5 },
      { id: 'm2', nombre: 'Hilo', stockActual: 10, stockMinimo: 5 },
      { id: 'm3', nombre: 'Botón', stockActual: 0, stockMinimo: 5, activo: false },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ tipo: 'stock_bajo', refId: 'm1', severidad: 'warn' });
  });
});

describe('alertasCajaSinCerrar', () => {
  it('alerta cajas abiertas de días anteriores, no la de hoy', () => {
    const a = alertasCajaSinCerrar(
      [
        { id: 'c1', sedeCod: 'LB', fecha: '2026-07-11', estado: 'abierta' },
        { id: 'c2', sedeCod: 'ST', fecha: HOY, estado: 'abierta' },
        { id: 'c3', sedeCod: 'TR', fecha: '2026-07-10', estado: 'cerrada' },
      ],
      HOY,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ refId: 'c1', sede: 'LB' });
  });
});

describe('alertasReportesSinEvaluar', () => {
  it('alerta reportes sin evaluar pasado el margen', () => {
    const a = alertasReportesSinEvaluar(
      [
        { id: 'r1', sedeCod: 'LB', fecha: '2026-07-09', evaluado: false }, // 3 días
        { id: 'r2', sedeCod: 'ST', fecha: HOY, evaluado: false }, // hoy, dentro de gracia
        { id: 'r3', sedeCod: 'TR', fecha: '2026-07-01', evaluado: true }, // ya evaluado
        { id: 'r4', sedeCod: 'AL', fecha: '2026-07-01', evaluado: false, noEvaluable: true },
      ],
      HOY,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ tipo: 'reporte_sin_evaluar', refId: 'r1', severidad: 'info' });
  });
});

describe('ordenarAlertas', () => {
  it('crítica antes que warn antes que info', () => {
    const alertas: Alerta[] = [
      { tipo: 'a', titulo: '', mensaje: '', severidad: 'info' },
      { tipo: 'b', titulo: '', mensaje: '', severidad: 'critica' },
      { tipo: 'c', titulo: '', mensaje: '', severidad: 'warn' },
    ];
    expect(ordenarAlertas(alertas).map((a) => a.severidad)).toEqual(['critica', 'warn', 'info']);
  });
});
