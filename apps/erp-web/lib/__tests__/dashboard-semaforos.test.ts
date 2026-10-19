// @ts-nocheck
// vitest no resuelve tipos desde erp-web (igual que porcentaje.test.ts).
import { describe, it, expect } from 'vitest';
import {
  luzMayorEsPeor,
  luzMenorEsPeor,
  peorLuz,
  umbralesDesdeConfig,
  DEFAULTS_DASHBOARD,
  diasEntre,
  sumarDias,
  ultimosDias,
  atrasoPorEtapa,
  resumenAsistencia,
} from '../dashboard-semaforos';

describe('semáforos del dashboard', () => {
  it('más es peor: cambia de color justo en el umbral', () => {
    const u = { ambar: 2, rojo: 4 };
    expect(luzMayorEsPeor(1, u)).toBe('verde');
    expect(luzMayorEsPeor(2, u)).toBe('ambar');
    expect(luzMayorEsPeor(3, u)).toBe('ambar');
    expect(luzMayorEsPeor(4, u)).toBe('rojo');
  });
  it('menos es peor: los umbrales son pisos', () => {
    const u = { ambar: 70, rojo: 40 };
    expect(luzMenorEsPeor(70, u)).toBe('verde');
    expect(luzMenorEsPeor(69, u)).toBe('ambar');
    expect(luzMenorEsPeor(40, u)).toBe('ambar');
    expect(luzMenorEsPeor(39, u)).toBe('rojo');
  });
  it('peorLuz toma el más grave', () => {
    expect(peorLuz([])).toBe('verde');
    expect(peorLuz(['verde', 'ambar'])).toBe('ambar');
    expect(peorLuz(['ambar', 'rojo', 'verde'])).toBe('rojo');
  });
  it('umbrales: vacío o inválido cae al default; coma decimal vale', () => {
    const u = umbralesDesdeConfig({ dash_prenda_ambar_dias: '', dash_prenda_rojo_dias: 'x', dash_eval_ambar: '5,5' });
    expect(u.atraso).toEqual({ ambar: DEFAULTS_DASHBOARD.dash_prenda_ambar_dias, rojo: DEFAULTS_DASHBOARD.dash_prenda_rojo_dias });
    expect(u.evaluar.ambar).toBe(5.5);
  });
  it('fechas: no usa la hora del sistema', () => {
    expect(diasEntre('2026-10-01', '2026-10-19')).toBe(18);
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(ultimosDias('2026-10-19', 3)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
  });
  it('atraso por etapa cuenta total, ámbar y rojo', () => {
    const m = atrasoPorEtapa(
      [
        { etapa: 'lavado', dias: 0 },
        { etapa: 'lavado', dias: 2 },
        { etapa: 'lavado', dias: 9 },
        { etapa: 'listo', dias: 1 },
      ],
      { ambar: 2, rojo: 4 },
    );
    expect(m.get('lavado')).toEqual({ total: 3, ambar: 1, rojo: 1 });
    expect(m.get('listo')).toEqual({ total: 1, ambar: 0, rojo: 0 });
  });

  it('asistencia con esperados: quien debía venir y no vino cuenta como falta', () => {
    const reg = new Map([
      ['a', { falta: false, trabajo: true, tarde: true }],
      ['b', { falta: true, trabajo: false, tarde: false }],
      ['z', { falta: false, trabajo: false, tarde: false }], // no le tocaba
    ]);
    const r = resumenAsistencia(reg, new Set(['a', 'b', 'c']));
    expect(r).toEqual({ presentes: 1, tardanzas: 1, faltas: 2, sinDato: 0, esperados: 3 });
  });
  it('asistencia sin esperados: sólo lo registrado', () => {
    const reg = new Map([['a', { falta: false, trabajo: true, tarde: false }], ['b', { falta: false, trabajo: false, tarde: false }]]);
    expect(resumenAsistencia(reg, null)).toEqual({ presentes: 1, tardanzas: 0, faltas: 0, sinDato: 1, esperados: null });
  });
});
