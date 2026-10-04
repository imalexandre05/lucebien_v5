// @ts-nocheck
//
// `@ts-nocheck` por el mismo motivo que `sueldos-repo.corregir.test.ts`. No afecta la ejecución.
//
// QUÉ PRUEBA. Que `accionCrearMovimiento` distinga lo que se sabe que NO escribió de lo incierto
// (spec 2026-10-03-adelantos-rendimiento-design.md, 3.ª revisión del verificador sobre el PR #40):
//   - un rechazo de validación previo al insert vuelve con `escrito: false` (la pantalla restaura);
//   - un error del insert vuelve SIN `escrito: false` (incierto: la pantalla no restaura y refresca);
//   - si el insert salió y lo que falla es la revalidación, la respuesta sigue siendo `ok: true`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crear = vi.fn();
const revalidar = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (...a) => revalidar(...a) }));
vi.mock('../auth', () => ({
  getSesion: vi.fn(async () => ({ usuario: { id: 'adm-1', rol: 'admin' } })),
}));
vi.mock('../sueldos-repo', async () => {
  class SueldoRpcError extends Error {
    constructor(message, codigo) {
      super(message);
      this.codigo = codigo;
    }
  }
  return {
    SueldoRpcError,
    crearMovimiento: (...a) => crear(...a),
    eliminarMovimiento: vi.fn(),
    // La validación real del repo, copiada en su forma mínima: un monto no positivo es DATO.
    validarMovimiento: (p) => {
      if (!p.monto || p.monto <= 0) throw new SueldoRpcError('El monto tiene que ser mayor que cero', 'DATO');
    },
  };
});

import { accionCrearMovimiento } from '../../app/sueldos/movimientos/actions';

const base = { empleadoId: 'e1', fecha: '2026-10-04', tipo: 'adelanto', monto: 100, motivo: 'adelanto' };

describe('accionCrearMovimiento — certeza de escritura', () => {
  beforeEach(() => {
    crear.mockReset();
    revalidar.mockReset();
  });

  it('validación previa al insert: escrito:false y no se intenta escribir', async () => {
    const r = await accionCrearMovimiento({ ...base, monto: 0 });
    expect(r).toMatchObject({ ok: false, escrito: false, codigo: 'DATO' });
    expect(crear).not.toHaveBeenCalled();
  });

  it('motivo vacío: escrito:false', async () => {
    const r = await accionCrearMovimiento({ ...base, motivo: '  ' });
    expect(r).toMatchObject({ ok: false, escrito: false });
    expect(crear).not.toHaveBeenCalled();
  });

  it('el insert falla (p. ej. Supabase devuelve error): incierto, sin escrito:false', async () => {
    crear.mockRejectedValue(new Error('fetch failed'));
    const r = await accionCrearMovimiento(base);
    expect(r.ok).toBe(false);
    expect(r.escrito).toBeUndefined();
  });

  it('el insert salió y falla la revalidación: sigue siendo ok:true con el id', async () => {
    crear.mockResolvedValue('mov-1');
    revalidar.mockImplementation(() => {
      throw new Error('revalidate failed');
    });
    expect(await accionCrearMovimiento(base)).toEqual({ ok: true, id: 'mov-1' });
  });
});
