// @ts-nocheck
// vitest no está declarado en apps/erp-web: el typecheck no resuelve sus tipos, pero el test corre.
import { describe, expect, it } from 'vitest';
import { tokenOperadorValido } from '../operador-token';

describe('tokenOperadorValido', () => {
  it('acepta un uuid', () => {
    expect(tokenOperadorValido('3f2b8c1e-5a47-4d0e-9c1b-7a6e2d4f8b90')).toBe(true);
  });
  it('rechaza texto que no es uuid, vacío y ausente', () => {
    expect(tokenOperadorValido('abc')).toBe(false);
    expect(tokenOperadorValido('')).toBe(false);
    expect(tokenOperadorValido(undefined)).toBe(false);
    expect(tokenOperadorValido(null)).toBe(false);
    expect(tokenOperadorValido("x'; drop table empleados;--")).toBe(false);
  });
});
