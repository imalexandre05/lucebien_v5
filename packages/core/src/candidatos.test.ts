import { describe, it, expect } from 'vitest';
import { transicionValida, finDePrueba, puedeCerrarPrueba, ESTADOS_CANDIDATO } from './candidatos';

describe('candidatos: transiciones', () => {
  it('el camino feliz es válido de punta a punta', () => {
    const ruta = ['por_entrevistar', 'entrevistado', 'en_prueba', 'prueba_cerrada', 'contratado'] as const;
    for (let i = 0; i < ruta.length - 1; i++) expect(transicionValida(ruta[i], ruta[i + 1])).toBe(true);
  });

  it('no se puede saltar etapas ni cerrar una prueba que no se inició', () => {
    expect(transicionValida('por_entrevistar', 'en_prueba')).toBe(false);
    expect(transicionValida('entrevistado', 'prueba_cerrada')).toBe(false);
    expect(transicionValida('en_prueba', 'contratado')).toBe(false);
  });

  it('la prueba puede repetirse desde prueba_cerrada', () => {
    expect(transicionValida('prueba_cerrada', 'entrevistado')).toBe(true);
  });

  it('se descarta desde cualquier estado menos contratado, y un descartado se reactiva', () => {
    for (const e of ESTADOS_CANDIDATO.filter((x) => x !== 'contratado' && x !== 'descartado')) {
      expect(transicionValida(e, 'descartado')).toBe(true);
    }
    expect(transicionValida('contratado', 'descartado')).toBe(false);
    expect(transicionValida('descartado', 'por_entrevistar')).toBe(true);
    expect(transicionValida('descartado', 'contratado')).toBe(false);
  });
});

describe('candidatos: fechas de la prueba (hora Perú entra de afuera)', () => {
  it('3 días de prueba: el último día es desde + 2', () => {
    expect(finDePrueba('2026-10-19', 3)).toBe('2026-10-21');
    expect(finDePrueba('2026-10-30', 3)).toBe('2026-11-01'); // cruza de mes
    expect(finDePrueba('2026-10-19', 1)).toBe('2026-10-19');
  });

  it('rechaza días inválidos o fechas mal formadas', () => {
    expect(() => finDePrueba('2026-10-19', 0)).toThrow(/días/);
    expect(() => finDePrueba('19/10/2026', 3)).toThrow(/fecha/i);
  });

  it('sólo se cierra desde el día de fin en adelante', () => {
    expect(puedeCerrarPrueba('2026-10-20', '2026-10-21')).toBe(false);
    expect(puedeCerrarPrueba('2026-10-21', '2026-10-21')).toBe(true);
    expect(puedeCerrarPrueba('2026-10-22', '2026-10-21')).toBe(true);
  });
});
