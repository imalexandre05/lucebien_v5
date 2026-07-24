import { describe, it, expect } from 'vitest';
import { loginSchema, loginUsuarioSchema, puede, type MatrizPermisos } from './auth';

describe('loginSchema (cod+sede)', () => {
  it('valida código de 4 dígitos', () => {
    expect(loginSchema.safeParse({ sede: 'LB', cod: '1234', password: 'x' }).success).toBe(true);
  });
  it('rechaza código que no sea de 4 dígitos', () => {
    expect(loginSchema.safeParse({ sede: 'LB', cod: '12', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ sede: 'LB', cod: 'abcd', password: 'x' }).success).toBe(false);
  });
});

describe('loginUsuarioSchema (usuario+contraseña, LOGIN_V2)', () => {
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
