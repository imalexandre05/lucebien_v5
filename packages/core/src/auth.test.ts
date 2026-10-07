import { describe, it, expect } from 'vitest';
import { loginUsuarioSchema, puede, type MatrizPermisos } from './auth';

describe('loginUsuarioSchema (usuario+contraseña)', () => {
  it('acepta usuario y contraseña no vacíos', () => {
    expect(loginUsuarioSchema.safeParse({ usuario: 'Alexander', password: 'secreta' }).success).toBe(true);
  });
  it('rechaza usuario o contraseña vacíos', () => {
    expect(loginUsuarioSchema.safeParse({ usuario: '', password: 'secreta' }).success).toBe(false);
    expect(loginUsuarioSchema.safeParse({ usuario: 'Alexander', password: '' }).success).toBe(false);
  });
});

describe('puede (permisos)', () => {
  const matriz: MatrizPermisos = { encargado_tienda: { inventario: ['ver', 'crear'] } };
  it('admin y dueno: acceso total', () => {
    expect(puede({}, 'admin', 'pagos', 'eliminar')).toBe(true);
    expect(puede({}, 'dueno', 'inventario', 'editar')).toBe(true);
  });
  it('rol restringido: según la matriz', () => {
    expect(puede(matriz, 'encargado_tienda', 'inventario', 'crear')).toBe(true);
    expect(puede(matriz, 'encargado_tienda', 'inventario', 'eliminar')).toBe(false);
    expect(puede(matriz, 'confeccionista', 'inventario', 'ver')).toBe(false);
  });
});

describe('puede con rolCod (roles derivados, Fase 1)', () => {
  const matriz: MatrizPermisos = {
    ventas_junior: { pedidos: ['ver', 'crear'], caja: ['ver'] },
    vendedor_senior: { pedidos: ['ver', 'crear', 'editar'], caja: [] },
  };
  it('el rol derivado manda cuando tiene fila configurada para ese módulo', () => {
    expect(puede(matriz, 'ventas_junior', 'pedidos', 'editar', 'vendedor_senior')).toBe(true);
  });
  it('fila vacía en el rol derivado = revocado explícito (no cae al base)', () => {
    expect(puede(matriz, 'ventas_junior', 'caja', 'ver', 'vendedor_senior')).toBe(false);
  });
  it('sin fila para ese módulo en el rol derivado: cae al rol base', () => {
    const soloUnModulo: MatrizPermisos = { ventas_junior: { pedidos: ['ver'] }, vendedor_senior: { pedidos: ['ver', 'crear'] } };
    expect(puede(soloUnModulo, 'ventas_junior', 'caja', 'ver', 'vendedor_senior')).toBe(false);
    const matrizConCaja: MatrizPermisos = { ventas_junior: { caja: ['ver'] }, vendedor_senior: { pedidos: ['ver'] } };
    expect(puede(matrizConCaja, 'ventas_junior', 'caja', 'ver', 'vendedor_senior')).toBe(true);
  });
  it('admin/dueno siguen pasando siempre aunque tengan rolCod', () => {
    expect(puede({}, 'admin', 'pagos', 'eliminar', 'cualquier-cod')).toBe(true);
  });
  it('sin rolCod (null/undefined): se comporta como antes, solo el rol base', () => {
    expect(puede(matriz, 'ventas_junior', 'pedidos', 'crear')).toBe(true);
    expect(puede(matriz, 'ventas_junior', 'pedidos', 'crear', null)).toBe(true);
  });
});
