import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parametrosDeContratoNuevo, CLAVES_PARAMETROS_CONTRATO } from './contrato-parametros';
import { PARAMETROS_SUELDO_DEFAULT } from './sueldos';

// Spec: docs/superpowers/specs/sueldos/2026-10-05-contrato-valores-pactados-design.md

describe('parametrosDeContratoNuevo — un contrato nace con TODOS sus valores pactados', () => {
  it('sin nada en config, copia los 15 defaults del código (metaSemanal queda fuera)', () => {
    const p = parametrosDeContratoNuevo({}, {});
    expect(Object.keys(p).sort()).toEqual([...CLAVES_PARAMETROS_CONTRATO].sort());
    expect(Object.keys(p)).toHaveLength(15);
    expect('metaSemanal' in p).toBe(false);
    expect(p.toleranciaMinutos).toBe(PARAMETROS_SUELDO_DEFAULT.toleranciaMinutos);
    expect(p.metaSemanalFija).toBe(false);
  });

  it('lo fijado en /configuracion gana al default del código', () => {
    const p = parametrosDeContratoNuevo({ toleranciaMinutos: 20, pctComision: 0.03 }, {});
    expect(p.toleranciaMinutos).toBe(20);
    expect(p.pctComision).toBe(0.03);
    expect(p.tardanzasLibres).toBe(PARAMETROS_SUELDO_DEFAULT.tardanzasLibres);
  });

  it('lo que trae el formulario gana a la configuración', () => {
    const p = parametrosDeContratoNuevo({ valorAlmuerzo: 10 }, { valorAlmuerzo: 12 });
    expect(p.valorAlmuerzo).toBe(12);
  });

  it('un valor del formulario en null o undefined no pisa al global', () => {
    const p = parametrosDeContratoNuevo({ valorAlmuerzo: 10, penalidadTardanza: 7 }, { valorAlmuerzo: undefined, penalidadTardanza: null as never });
    expect(p.valorAlmuerzo).toBe(10);
    expect(p.penalidadTardanza).toBe(7);
  });

  it('una meta semanal pactada se conserva; sin meta no aparece la clave', () => {
    expect(parametrosDeContratoNuevo({}, { metaSemanal: 1800 }).metaSemanal).toBe(1800);
    expect('metaSemanal' in parametrosDeContratoNuevo({}, { metaSemanal: null })).toBe(false);
  });

  it('cambiar la configuración después no mueve un contrato ya copiado', () => {
    const contrato = parametrosDeContratoNuevo({ toleranciaMinutos: 10 }, {});
    parametrosDeContratoNuevo({ toleranciaMinutos: 99 }, {}); // «cambio» posterior en /configuracion
    expect(contrato.toleranciaMinutos).toBe(10);
  });

  it('rechaza lo que el motor rechazaría: clave desconocida, negativo', () => {
    expect(() => parametrosDeContratoNuevo({}, { tolerancia_minutos: 5 } as never)).toThrow(/desconocido/);
    expect(() => parametrosDeContratoNuevo({ tardanzasLibres: -1 }, {})).toThrow(/negativo/);
  });
});

describe('0118 — los defaults de la migración no se alejan del core', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../db/migrations/0118_contrato_valores_pactados.sql'),
    'utf8',
  );
  const bloque = sql.split('-- DEFAULTS:begin')[1]?.split('-- DEFAULTS:end')[0] ?? '';
  const literal: Record<string, number | boolean> = {};
  for (const m of bloque.matchAll(/'([A-Za-z]+)'\s*,\s*(true|false|-?[0-9]+(?:\.[0-9]+)?)/g)) {
    literal[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]);
  }

  it('la migración congela exactamente las 15 claves', () => {
    expect(Object.keys(literal).sort()).toEqual([...CLAVES_PARAMETROS_CONTRATO].sort());
  });

  it('cada valor es el de PARAMETROS_SUELDO_DEFAULT', () => {
    for (const clave of CLAVES_PARAMETROS_CONTRATO) {
      expect(literal[clave], clave).toBe(PARAMETROS_SUELDO_DEFAULT[clave]);
    }
  });
});
