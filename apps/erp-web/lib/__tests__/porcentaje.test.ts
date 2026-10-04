// @ts-nocheck
//
// `@ts-nocheck` por la misma razón que `sueldos-repo.corregir.test.ts`: vitest no es dependencia
// declarada de erp-web y sus tipos no resuelven desde acá. El archivo corre igual (paso 4 de
// `tools/verificar-local.sh`).
//
// Spec: docs/superpowers/specs/sueldos/2026-10-03-comision-en-porcentaje-design.md
import { describe, expect, it } from 'vitest';
import {
  avisoComisionBaja,
  comisionRequiereConfirmacion,
  fraccionAPorcentaje,
  leerNumero,
  porcentajeAFraccion,
} from '../porcentaje';

const valor = (texto: string) => {
  const r = porcentajeAFraccion(texto);
  if (!r.ok) throw new Error(`se esperaba válido: "${texto}" → ${r.error}`);
  return r.valor;
};

describe('porcentajeAFraccion — lo que se escribe en pantalla a lo que se guarda', () => {
  it('convierte los casos del ticket sin depender de los ceros finales', () => {
    expect(valor('1.5')).toBe(0.015);
    expect(valor('1.50')).toBe(0.015);
    expect(valor('2')).toBe(0.02);
    expect(valor('2.0')).toBe(0.02);
  });

  it('0 es un valor válido (sin comisión), no lo mismo que vacío', () => {
    expect(valor('0')).toBe(0);
    expect(valor('0.0')).toBe(0);
  });

  it('vacío o sólo espacios es null: el contrato usa el valor global', () => {
    expect(valor('')).toBeNull();
    expect(valor('   ')).toBeNull();
  });

  it('acepta los límites del rango: 0 % y 100 %', () => {
    expect(valor('100')).toBe(1);
    expect(valor('100.00')).toBe(1);
  });

  it('acepta coma decimal y espacios alrededor', () => {
    expect(valor('1,5')).toBe(0.015);
    expect(valor(' 2,25 ')).toBe(0.0225);
  });

  it('no arrastra ruido de coma flotante', () => {
    expect(valor('1.1')).toBe(0.011);
    expect(valor('0.5')).toBe(0.005);
    expect(valor('7')).toBe(0.07);
    expect(valor('33.3')).toBe(0.333);
  });

  it('rechaza lo que está fuera de 0–100 o no es un número', () => {
    for (const t of ['-1', '-0.5', '100.01', '150', 'abc', '1.5%', '1..5', '1,5,0', 'Infinity', 'NaN', '1e2']) {
      expect(porcentajeAFraccion(t).ok, t).toBe(false);
    }
  });
});

describe('fraccionAPorcentaje — lo guardado a lo que se muestra', () => {
  it('muestra la fracción guardada como porcentaje legible', () => {
    expect(fraccionAPorcentaje(0.015)).toBe('1.5');
    expect(fraccionAPorcentaje(0.02)).toBe('2');
    expect(fraccionAPorcentaje(0)).toBe('0');
    expect(fraccionAPorcentaje(1)).toBe('100');
    expect(fraccionAPorcentaje(0.011)).toBe('1.1');
    expect(fraccionAPorcentaje(0.07)).toBe('7');
  });

  it('ida y vuelta conserva el valor', () => {
    for (const f of [0, 0.005, 0.011, 0.015, 0.02, 0.0225, 0.07, 0.333, 1]) {
      expect(valor(fraccionAPorcentaje(f))).toBe(f);
    }
  });
});

describe('leerNumero — los demás parámetros del contrato, como texto libre', () => {
  it('lee decimales con punto o coma y vacío como null', () => {
    expect(leerNumero('0.85', { min: 0 })).toEqual({ ok: true, valor: 0.85 });
    expect(leerNumero('0,85', { min: 0 })).toEqual({ ok: true, valor: 0.85 });
    expect(leerNumero('10.0', { min: 0 })).toEqual({ ok: true, valor: 10 });
    expect(leerNumero('', { min: 0 })).toEqual({ ok: true, valor: null });
  });

  it('respeta min y max', () => {
    expect(leerNumero('-1', { min: 0 }).ok).toBe(false);
    expect(leerNumero('0', { min: 1 }).ok).toBe(false);
    expect(leerNumero('1', { min: 1 }).ok).toBe(true);
    expect(leerNumero('5', { min: 0, max: 4 }).ok).toBe(false);
    expect(leerNumero('abc', { min: 0 }).ok).toBe(false);
  });

  it('rechaza un número que no entra en un double (daría Infinity)', () => {
    expect(leerNumero('9'.repeat(400), { min: 0 }).ok).toBe(false);
  });
});

describe('comisionRequiereConfirmacion — aviso por comisión muy baja (spec §Aviso)', () => {
  it('pide confirmación entre 0 y 0,5 % sin incluirlos', () => {
    expect(comisionRequiereConfirmacion(valor('0.02'))).toBe(true); // el caso del ticket: unidad vieja
    expect(comisionRequiereConfirmacion(valor('0.001'))).toBe(true);
    expect(comisionRequiereConfirmacion(valor('0.49'))).toBe(true);
  });

  it('0 es válido sin aviso, y 0,5 % o más tampoco avisa', () => {
    expect(comisionRequiereConfirmacion(valor('0'))).toBe(false);
    expect(comisionRequiereConfirmacion(valor('0.5'))).toBe(false);
    expect(comisionRequiereConfirmacion(valor('1.5'))).toBe(false);
    expect(comisionRequiereConfirmacion(valor('100'))).toBe(false);
  });

  it('sin valor (usa el global) no avisa', () => {
    expect(comisionRequiereConfirmacion(null)).toBe(false);
    expect(comisionRequiereConfirmacion(undefined)).toBe(false);
  });

  it('el aviso sugiere el número leído en la unidad vieja', () => {
    expect(avisoComisionBaja(valor('0.02'))).toBe('¿Seguro? 0,02 % es muy bajo. Si quisiste 2 %, escribe 2.');
    expect(avisoComisionBaja(valor('0.015'))).toBe('¿Seguro? 0,015 % es muy bajo. Si quisiste 1,5 %, escribe 1.5.');
    expect(avisoComisionBaja(valor('2'))).toBeNull();
    expect(avisoComisionBaja(0)).toBeNull();
  });
});
