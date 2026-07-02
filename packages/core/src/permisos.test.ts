import { describe, it, expect } from 'vitest';
import { esSupervisor, sedesPermitidas, type Usuario } from './permisos';

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
