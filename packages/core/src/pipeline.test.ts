import { describe, it, expect } from 'vitest';
import {
  ETAPAS_PIPELINE,
  siguienteEtapa,
  TRANSICIONES,
  clavePuntos,
  esMediaPrenda,
  puntosAvance,
} from './pipeline';

describe('siguienteEtapa', () => {
  it('avanza en orden', () => {
    expect(siguienteEtapa('recepcion')).toBe('lavado');
    expect(siguienteEtapa('lavado')).toBe('empatado');
  });
  it('la última etapa no tiene siguiente', () => {
    expect(siguienteEtapa('listo')).toBeNull();
  });
});

describe('TRANSICIONES del tablero', () => {
  it('toda etapa tiene destinos definidos', () => {
    for (const e of ETAPAS_PIPELINE) expect(TRANSICIONES[e]).toBeDefined();
  });
  it('recepción puede ir a lavado o refacción', () => {
    expect(TRANSICIONES.recepcion).toContain('lavado');
    expect(TRANSICIONES.recepcion).toContain('refaccion');
  });
  it('control de calidad va a listo', () => {
    expect(TRANSICIONES.control_calidad).toEqual(['listo']);
  });
  it('todos los destinos son etapas válidas', () => {
    for (const e of ETAPAS_PIPELINE) {
      for (const d of TRANSICIONES[e]) expect(ETAPAS_PIPELINE).toContain(d);
    }
  });
});

describe('clavePuntos (config pts_*)', () => {
  it('lavado distingue por tipo de lavado', () => {
    expect(clavePuntos('lavado', 'seco')).toBe('pts_lavado_seco');
    expect(clavePuntos('lavado', 'especializado')).toBe('pts_lavado_especializado');
    expect(clavePuntos('lavado', null)).toBe('pts_lavado_normal');
  });
  it('otras etapas usan su nombre', () => {
    expect(clavePuntos('planchado')).toBe('pts_planchado');
    expect(clavePuntos('empatado')).toBe('pts_empatado');
  });
});

describe('esMediaPrenda / puntosAvance (regla ½, E1)', () => {
  it('terno completo NO es media prenda', () => {
    expect(esMediaPrenda('terno completo')).toBe(false);
    expect(esMediaPrenda('Terno')).toBe(false);
  });
  it('piezas sueltas SÍ lo son', () => {
    expect(esMediaPrenda('saco')).toBe(true);
    expect(esMediaPrenda('pantalón')).toBe(true);
    expect(esMediaPrenda('Chaleco azul')).toBe(true);
    expect(esMediaPrenda('blazer')).toBe(true);
  });
  it('vacío/desconocido no cuenta como media prenda', () => {
    expect(esMediaPrenda(null)).toBe(false);
    expect(esMediaPrenda('')).toBe(false);
    expect(esMediaPrenda('accesorio')).toBe(false);
  });
  it('puntosAvance aplica ½ solo a piezas sueltas', () => {
    expect(puntosAvance(3, 'terno completo')).toBe(3);
    expect(puntosAvance(3, 'saco')).toBe(1.5);
    expect(puntosAvance(5, 'pantalón')).toBe(2.5);
  });
});
