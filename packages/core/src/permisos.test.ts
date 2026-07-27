import { describe, it, expect } from 'vitest';
import { esSupervisor, sedesPermitidas, slugRol, ROLES_BASE, type Usuario } from './permisos';

const u = (rol: Usuario['rol'], sede = 'LB', tiendas?: string[]): Usuario => ({ id: 'x', rol, sede, tiendas });

describe('esSupervisor', () => {
  it('admin/dueño/encargados son supervisores', () => {
    expect(esSupervisor(u('admin'))).toBe(true);
    expect(esSupervisor(u('dueno'))).toBe(true);
    expect(esSupervisor(u('encargado_tienda'))).toBe(true);
    expect(esSupervisor(u('encargado_almacen'))).toBe(true);
  });
  it('ventas/confección no lo son', () => {
    expect(esSupervisor(u('ventas_junior'))).toBe(false);
    expect(esSupervisor(u('ventas_junior_2'))).toBe(false);
    expect(esSupervisor(u('confeccionista'))).toBe(false);
  });
});

describe('sedesPermitidas (alcance por sede)', () => {
  it('admin/dueño: sin filtro (acceso total = null)', () => {
    expect(sedesPermitidas(u('admin'))).toBeNull();
    expect(sedesPermitidas(u('dueno'))).toBeNull();
  });
  it('otros roles: sus tiendas, o su sede si no tiene lista', () => {
    expect(sedesPermitidas(u('ventas_junior', 'ST', ['ST', 'LB']))).toEqual(['ST', 'LB']);
    expect(sedesPermitidas(u('encargado_tienda', 'TR'))).toEqual(['TR']);
  });
});

describe('ROLES_BASE', () => {
  it('son exactamente los 7 roles fijos que usa la RLS', () => {
    expect(ROLES_BASE).toHaveLength(7);
    expect(ROLES_BASE).toContain('admin');
    expect(ROLES_BASE).toContain('ventas_junior_2');
  });
});

describe('slugRol (Fase 1: código de un rol derivado)', () => {
  it('minúsculas y guion bajo', () => {
    expect(slugRol('Vendedor Senior')).toBe('vendedor_senior');
  });
  it('quita tildes y eñes', () => {
    expect(slugRol('Atención al Público')).toBe('atencion_al_publico');
    expect(slugRol('Diseño')).toBe('diseno');
  });
  it('colapsa símbolos sueltos a un solo guion bajo y recorta bordes', () => {
    expect(slugRol('  Ventas -- Premium!! ')).toBe('ventas_premium');
  });
});
