// @ts-nocheck
//
// `@ts-nocheck` por el mismo motivo que `sueldos-repo.corregir.test.ts`. No afecta la ejecución.
//
// QUÉ PRUEBA. El rollback de la actualización optimista de `/sueldos/movimientos` (revisión del
// verificador sobre el PR #40): un fallo de TRANSPORTE —la promesa de la Server Action rechaza— se
// tiene que convertir en un resultado de error, para que el rollback corra igual que ante un
// `ok: false`. Si no, un borrado fallido ocultaría un adelanto que sigue en la base.
import { describe, expect, it } from 'vitest';
import { correrAccion, planTrasFallo, restaurarSiVacio, sinId } from '../movimientos-optimista';

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
    expect(r.transporte).toBe(true);
    expect(r.error).toMatch(/^No se pudo confirmar el borrado\./);
    expect(r.error).toMatch(/revise la lista antes de volver a registrar/);
  });

  it('un ok:false del servidor no se marca como transporte', async () => {
    const r = await correrAccion(async () => ({ ok: false, error: 'CONGELADA' }), 'x');
    expect(r.transporte).toBeUndefined();
  });
});

describe('planTrasFallo', () => {
  it('fallo de transporte: NO restaura el formulario (la base pudo escribir) y refresca la lista real', async () => {
    const r = await correrAccion(async () => {
      throw new Error('timeout');
    }, 'x');
    expect(planTrasFallo(r)).toEqual({ restaurarFormulario: false, refrescar: true });
  });

  it('rechazo del servidor: se sabe que no se escribió, se restaura y no hace falta refrescar', () => {
    expect(planTrasFallo({ ok: false, error: 'El motivo es obligatorio' })).toEqual({
      restaurarFormulario: true,
      refrescar: false,
    });
  });
});

describe('restaurarSiVacio', () => {
  const tipeado = {
    empleadoId: 'e1',
    fecha: '2026-10-04',
    tipo: 'adelanto',
    monto: '100',
    cantidad: '1',
    motivo: 'adelanto',
  };
  const limpio = { ...tipeado, monto: '', cantidad: '1', motivo: '' };

  it('con el formulario limpio e intacto, devuelve lo tipeado', () => {
    expect(restaurarSiVacio(limpio, tipeado)).toBe(tipeado);
  });

  it('si la persona ya empezó a cargar otro, no lo pisa', () => {
    const conMonto = { ...limpio, monto: '50' };
    expect(restaurarSiVacio(conMonto, tipeado)).toBe(conMonto);
    const conMotivo = { ...limpio, motivo: 'otro' };
    expect(restaurarSiVacio(conMotivo, tipeado)).toBe(conMotivo);
  });

  it('si sólo cambió la persona, la fecha o el tipo, tampoco lo pisa', () => {
    for (const cambio of [{ empleadoId: 'e2' }, { fecha: '2026-10-05' }, { tipo: 'bono_extra' }]) {
      const actual = { ...limpio, ...cambio };
      expect(restaurarSiVacio(actual, tipeado)).toBe(actual);
    }
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
