import { describe, it, expect } from 'vitest';
import { sanitizeEmpleado, generarIniciales, elegirCodigoLibre } from './empleados';

describe('sanitizeEmpleado', () => {
  const emp = {
    id: 'x',
    nombre: 'Ana',
    cod_hash: 'secreto',
    password_hash: 'secreto',
    dni: '12345678',
    salario_base: 1200,
  };
  it('siempre quita credenciales, admin o no', () => {
    expect(sanitizeEmpleado(emp, true)).not.toHaveProperty('cod_hash');
    expect(sanitizeEmpleado(emp, false)).not.toHaveProperty('password_hash');
  });
  it('oculta PII a quien no es admin', () => {
    const visto = sanitizeEmpleado(emp, false);
    expect(visto).not.toHaveProperty('dni');
    expect(visto).not.toHaveProperty('salario_base');
    expect(visto.nombre).toBe('Ana');
  });
  it('admin sí ve la PII', () => {
    const visto = sanitizeEmpleado(emp, true);
    expect(visto.dni).toBe('12345678');
    expect(visto.salario_base).toBe(1200);
  });
});

describe('generarIniciales', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(generarIniciales('Alexander Flores')).toBe('AF');
  });
  it('un solo nombre: una sola letra', () => {
    expect(generarIniciales('Ana')).toBe('A');
  });
  it('ignora espacios repetidos y mayúsculas', () => {
    expect(generarIniciales('  ana   maria  ')).toBe('AM');
  });
  it('nombre vacío: punto de relleno', () => {
    expect(generarIniciales('   ')).toBe('·');
  });
});

describe('elegirCodigoLibre', () => {
  it('devuelve un código de 4 dígitos que no está ocupado', () => {
    // 0.5 → '5000', libre (los ocupados son '0001'/'0002') — aleatorio CONSTANTE a propósito
    // para probar que un primer intento ya libre no reintenta.
    const cod = elegirCodigoLibre(['0001', '0002'], () => 0.5);
    expect(cod).toMatch(/^\d{4}$/);
    expect(cod).toBe('5000');
  });
  it('reintenta hasta encontrar uno libre si el primero está ocupado', () => {
    // aleatorio() fijo en 0 siempre generaría '0000'; si está ocupado, debe reintentar.
    let llamadas = 0;
    const aleatorio = () => {
      llamadas += 1;
      return llamadas === 1 ? 0 : 0.5; // primer intento '0000' (ocupado), luego '5000'
    };
    const cod = elegirCodigoLibre(['0000'], aleatorio);
    expect(cod).toBe('5000');
    expect(llamadas).toBeGreaterThan(1);
  });
  it('lanza si los 10000 códigos están ocupados', () => {
    const todos = Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, '0'));
    expect(() => elegirCodigoLibre(todos)).toThrow();
  });
});
