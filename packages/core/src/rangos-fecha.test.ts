import { describe, expect, it } from 'vitest';
import {
  desplazarRango,
  diasDelRango,
  esFechaValida,
  lunesDeSemana,
  rangoDeVista,
  recortarRango,
  resolverRango,
} from './rangos-fecha';

describe('rangoDeVista', () => {
  it('semana de lunes a domingo, aun si el ancla es domingo', () => {
    // 2026-10-04 es domingo; 2026-09-28 es lunes.
    expect(rangoDeVista('semana', '2026-10-04')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(rangoDeVista('semana', '2026-09-28')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
  });

  it('semana que cruza de año', () => {
    // 2027-01-01 es viernes; su lunes es 2026-12-28.
    expect(rangoDeVista('semana', '2027-01-01')).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
  });

  it('mes con su último día real (28, 29, 30, 31)', () => {
    expect(rangoDeVista('mes', '2026-02-15')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoDeVista('mes', '2028-02-15')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoDeVista('mes', '2026-09-30')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(rangoDeVista('mes', '2026-12-31')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });

  it('día es el mismo día', () => {
    expect(rangoDeVista('dia', '2026-10-03')).toEqual({ desde: '2026-10-03', hasta: '2026-10-03' });
  });
});

describe('desplazarRango', () => {
  it('día cruza de mes', () => {
    expect(desplazarRango('dia', { desde: '2026-10-01', hasta: '2026-10-01' }, -1)).toEqual({
      desde: '2026-09-30',
      hasta: '2026-09-30',
    });
  });

  it('semana se corre 7 días y sigue empezando en lunes', () => {
    const r = desplazarRango('semana', { desde: '2026-09-28', hasta: '2026-10-04' }, 1);
    expect(r).toEqual({ desde: '2026-10-05', hasta: '2026-10-11' });
    expect(lunesDeSemana(r.desde)).toBe(r.desde);
  });

  it('mes desde un mes de 31 no se salta febrero', () => {
    expect(desplazarRango('mes', { desde: '2026-01-01', hasta: '2026-01-31' }, 1)).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
    expect(desplazarRango('mes', { desde: '2026-01-01', hasta: '2026-01-31' }, -1)).toEqual({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
  });

  it('rango personalizado se corre su propio largo', () => {
    const r = { desde: '2026-10-01', hasta: '2026-10-10' };
    expect(diasDelRango(r)).toBe(10);
    expect(desplazarRango('rango', r, 1)).toEqual({ desde: '2026-10-11', hasta: '2026-10-20' });
    expect(desplazarRango('rango', r, -1)).toEqual({ desde: '2026-09-21', hasta: '2026-09-30' });
  });
});

describe('resolverRango', () => {
  const hoy = '2026-10-03';

  it('sin parámetros usa el default con hoy como ancla', () => {
    expect(resolverRango({}, hoy, 'mes')).toEqual({
      vista: 'mes',
      rango: { desde: '2026-10-01', hasta: '2026-10-31' },
    });
  });

  it('sin parámetros y sin default devuelve null', () => {
    expect(resolverRango({}, hoy, null)).toBeNull();
    expect(resolverRango({ vista: 'basura' }, hoy, null)).toBeNull();
  });

  it('día, semana y mes recalculan hasta a partir de desde', () => {
    expect(resolverRango({ vista: 'semana', desde: '2026-09-02', hasta: '2030-01-01' }, hoy, null)).toEqual({
      vista: 'semana',
      rango: { desde: '2026-08-31', hasta: '2026-09-06' },
    });
  });

  it('una fecha inválida cae a hoy', () => {
    expect(resolverRango({ vista: 'dia', desde: '2026-02-30' }, hoy, null)?.rango).toEqual({
      desde: hoy,
      hasta: hoy,
    });
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('2026-2-3')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
  });

  it('rango invertido se da vuelta; el extremo que falta se completa con el otro', () => {
    expect(resolverRango({ vista: 'rango', desde: '2026-10-10', hasta: '2026-10-01' }, hoy, null)?.rango).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-10',
    });
    expect(resolverRango({ vista: 'rango', desde: '2026-10-10' }, hoy, null)?.rango).toEqual({
      desde: '2026-10-10',
      hasta: '2026-10-10',
    });
  });
});

describe('recortarRango', () => {
  it('deja igual un rango dentro del tope', () => {
    const r = { desde: '2026-01-01', hasta: '2026-12-31' };
    expect(recortarRango(r, 366)).toEqual({ rango: r, recortado: false });
  });

  it('conserva hasta y corta desde a maxDias', () => {
    const { rango, recortado } = recortarRango({ desde: '1900-01-01', hasta: '2026-10-03' }, 366);
    expect(recortado).toBe(true);
    expect(rango).toEqual({ desde: '2025-10-03', hasta: '2026-10-03' });
    expect(diasDelRango(rango)).toBe(366);
  });
});
