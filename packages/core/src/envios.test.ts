import { describe, it, expect } from 'vitest';
import { sedesFiltroEnvios, leerFiltrosEnvios, limitesRangoPeru } from './envios';
import type { Usuario } from './permisos';

describe('sedesFiltroEnvios', () => {
  const destinos = ['LB', 'ST', 'TR'];
  const u = (rol: Usuario['rol'], sede: string, tiendas?: string[]): Usuario => ({
    id: 'x',
    rol,
    sede,
    tiendas,
  });

  it('admin, dueño y almacén eligen entre todas las tiendas', () => {
    for (const rol of ['admin', 'dueno', 'encargado_almacen', 'confeccionista'] as const) {
      expect(sedesFiltroEnvios(u(rol, 'AL'), destinos)).toEqual(destinos);
    }
  });
  it('una encargada de tienda sólo elige entre sus tiendas', () => {
    expect(sedesFiltroEnvios(u('encargado_tienda', 'LB', ['LB', 'TR']), destinos)).toEqual(['LB', 'TR']);
  });
  it('sin tiendas asignadas cae a la sede activa', () => {
    expect(sedesFiltroEnvios(u('ventas_junior', 'ST'), destinos)).toEqual(['ST']);
  });
  it('sin sede ni tiendas no ofrece nada', () => {
    expect(sedesFiltroEnvios(u('ventas_junior', ''), destinos)).toEqual([]);
  });
});

describe('leerFiltrosEnvios', () => {
  const opciones = ['LB', 'ST', 'TR'];

  it('sin parámetros: todo nulo y página 1', () => {
    expect(leerFiltrosEnvios({}, opciones)).toEqual({ sede: null, desde: null, hasta: null, pagina: 1 });
  });
  it('acepta una sede de las opciones', () => {
    expect(leerFiltrosEnvios({ sede: 'TR' }, opciones).sede).toBe('TR');
  });
  it('ignora una sede que no está entre las opciones', () => {
    expect(leerFiltrosEnvios({ sede: 'XX' }, opciones).sede).toBeNull();
  });
  it('con una sola opción no aplica filtro de sede (lo hace la RLS)', () => {
    expect(leerFiltrosEnvios({ sede: 'LB' }, ['LB']).sede).toBeNull();
  });
  it('toma el primer valor si la sede viene repetida', () => {
    expect(leerFiltrosEnvios({ sede: ['ST', 'TR'] }, opciones).sede).toBe('ST');
  });
  it('ignora fechas mal formadas o imposibles', () => {
    const f = leerFiltrosEnvios({ desde: '2026-02-30', hasta: '01/09/2026' }, opciones);
    expect(f.desde).toBeNull();
    expect(f.hasta).toBeNull();
  });
  it('intercambia desde y hasta si vienen al revés', () => {
    const f = leerFiltrosEnvios({ desde: '2026-09-30', hasta: '2026-09-01' }, opciones);
    expect([f.desde, f.hasta]).toEqual(['2026-09-01', '2026-09-30']);
  });
  it('una página no entera o menor a 1 es la página 1', () => {
    expect(leerFiltrosEnvios({ pag: '0' }, opciones).pagina).toBe(1);
    expect(leerFiltrosEnvios({ pag: '2.5' }, opciones).pagina).toBe(1);
    expect(leerFiltrosEnvios({ pag: 'abc' }, opciones).pagina).toBe(1);
    expect(leerFiltrosEnvios({ pag: '3' }, opciones).pagina).toBe(3);
  });
});

describe('limitesRangoPeru', () => {
  it('sin fechas no hay límites', () => {
    expect(limitesRangoPeru(null, null)).toEqual({ gte: null, lt: null });
  });
  it('los límites caen a medianoche de Perú, y hasta es inclusivo', () => {
    expect(limitesRangoPeru('2026-09-01', '2026-09-30')).toEqual({
      gte: '2026-09-01T00:00:00-05:00',
      lt: '2026-10-01T00:00:00-05:00',
    });
  });
  it('cruza fin de año', () => {
    expect(limitesRangoPeru(null, '2026-12-31').lt).toBe('2027-01-01T00:00:00-05:00');
  });
});
