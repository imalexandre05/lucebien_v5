// @ts-nocheck
//
// `@ts-nocheck` por el mismo motivo que `sueldos-repo.corregir.test.ts`. No afecta la ejecución.
//
// QUÉ PRUEBA. El rollback de la actualización optimista de `/sueldos/movimientos` (revisión del
// verificador sobre el PR #40): un fallo de TRANSPORTE —la promesa de la Server Action rechaza— se
// tiene que convertir en un resultado de error, para que el rollback corra igual que ante un
// `ok: false`. Si no, un borrado fallido ocultaría un adelanto que sigue en la base.
import { describe, expect, it } from 'vitest';
import { correrAccion, restaurarSiVacio, sinId } from '../movimientos-optimista';

describe('correrAccion', () => {
  it('devuelve el resultado de la acción tal cual', async () => {
    expect(await correrAccion(async () => ({ ok: true, id: 'm1' }), 'x')).toEqual({ ok: true, id: 'm1' });
    expect(await correrAccion(async () => ({ ok: false, error: 'CONGELADA' }), 'x')).toEqual({
      ok: false,
      error: 'CONGELADA',
    });
  });

  it('un rechazo de transporte se vuelve ok:false con un mensaje que pide revisar antes de reintentar', async () => {
    const r = await correrAccion(async () => {
      throw new TypeError('Failed to fetch');
    }, 'No se pudo confirmar el borrado.');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^No se pudo confirmar el borrado\./);
    expect(r.error).toMatch(/Recargue la página/);
  });
});

describe('restaurarSiVacio', () => {
  const tipeado = { empleadoId: 'e1', monto: '100', cantidad: '1', motivo: 'adelanto' };

  it('con el formulario vacío, devuelve lo tipeado', () => {
    const vacio = { empleadoId: 'e1', monto: '', cantidad: '1', motivo: '' };
    expect(restaurarSiVacio(vacio, tipeado)).toBe(tipeado);
  });

  it('si la persona ya empezó a cargar otro, no lo pisa', () => {
    const siguiente = { empleadoId: 'e2', monto: '50', cantidad: '1', motivo: '' };
    expect(restaurarSiVacio(siguiente, tipeado)).toBe(siguiente);
    const conMotivo = { empleadoId: 'e1', monto: '', cantidad: '1', motivo: 'otro' };
    expect(restaurarSiVacio(conMotivo, tipeado)).toBe(conMotivo);
  });
});

describe('sinId', () => {
  it('devuelve la fila a la vista quitando su id del conjunto, sin mutar el original', () => {
    const b = new Set(['a', 'b']);
    const n = sinId(b, 'a');
    expect([...n]).toEqual(['b']);
    expect([...b]).toEqual(['a', 'b']);
  });

  it('sin el id, devuelve el mismo conjunto', () => {
    const b = new Set(['a']);
    expect(sinId(b, 'z')).toBe(b);
  });
});
