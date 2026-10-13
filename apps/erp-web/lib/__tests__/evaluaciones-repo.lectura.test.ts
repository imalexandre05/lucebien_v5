// @ts-nocheck
// Ver el encabezado de sueldos-repo.corregir.test.ts: por qué `@ts-nocheck` en los tests de erp-web.
//
// Spec valores360-base §3.5: sólo el administrador lee `evaluaciones_mensuales` directo; cualquier otro
// pasa por `evaluaciones_mensuales_visibles` (0119), sin respaldo que lea la tabla. La nota «en cálculo»
// llega en null y no se convierte en 0.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rol;
let llamadas;
const fila = (o) => ({ id: 'e1', empleado_id: 'u1', mes: '2026-09', nota_final: 15, componentes: { reportes: 10 }, metodo: 'ponderado', ...o });
let datos;

function builder(origen) {
  const b = { limit: async () => { llamadas.push(origen); return { data: datos, error: null }; }, select: () => b, order: () => b };
  return b;
}
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({ from: (t) => builder(`tabla:${t}`), rpc: (f) => builder(`rpc:${f}`) }),
}));
vi.mock('../auth', () => ({ getSesion: async () => ({ usuario: { id: 'u1', rol } }) }));
vi.mock('../directorio', () => ({ mapaNombres: async () => new Map([['u1', 'Ana']]) }));
vi.mock('../config-repo', () => ({ leerConfigMap: async () => ({}) }));

import { listarEvaluaciones } from '../evaluaciones-repo';

describe('listarEvaluaciones (lectura según quién mira)', () => {
  beforeEach(() => { llamadas = []; datos = [fila({})]; });

  it('el administrador lee la tabla y no se le oculta nada', async () => {
    rol = 'admin';
    const r = await listarEvaluaciones();
    expect(llamadas).toEqual(['tabla:evaluaciones_mensuales']);
    expect(r[0].valoresOculto).toBe(false);
    expect(r[0].notaFinal).toBe(15);
  });

  it('cualquier otro rol lee por la función, nunca por la tabla', async () => {
    rol = 'encargado_tienda';
    await listarEvaluaciones();
    expect(llamadas).toEqual(['rpc:evaluaciones_mensuales_visibles']);
  });

  it('nota en null («en cálculo») no se vuelve 0, y los valores quedan ocultos', async () => {
    rol = 'confeccionista';
    datos = [fila({ nota_final: null, valores_publicos: false })];
    const r = await listarEvaluaciones();
    expect(r[0].notaFinal).toBeNull();
    expect(r[0].valoresOculto).toBe(true);
  });

  it('el administrador con nota null en la tabla la sigue viendo como 0, no «en cálculo»', async () => {
    rol = 'admin';
    datos = [fila({ nota_final: null })];
    expect((await listarEvaluaciones())[0].notaFinal).toBe(0);
  });

  it('mes público: la fila llega completa', async () => {
    rol = 'confeccionista';
    datos = [fila({ valores_publicos: true, componentes: { valores: 16, valoresCantidad: 3 } })];
    const r = await listarEvaluaciones();
    expect(r[0].valoresOculto).toBe(false);
    expect(r[0].componentes.valores).toBe(16);
  });
});
