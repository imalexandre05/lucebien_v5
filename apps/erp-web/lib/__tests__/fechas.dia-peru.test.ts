// @ts-nocheck
// Mismo motivo que sueldos-repo.corregir.test.ts: `vitest` no está declarado en apps/erp-web; el
// archivo se ejecuta con el vitest de packages/core (tools/verificar-local.sh, paso 4).
//
// Spec: docs/superpowers/specs/sueldos/2026-10-04-puntos-dia-hora-peru-design.md §6.
import { describe, expect, it } from 'vitest';
import { diaPeruDe } from '../fechas';

describe('diaPeruDe — el día de un instante en hora Perú, no en UTC', () => {
  it('2026-09-30 23:30-05 (04:30 UTC del 1-oct) cuenta como 30 de septiembre', () => {
    expect(diaPeruDe('2026-10-01T04:30:00+00:00')).toBe('2026-09-30');
    expect(diaPeruDe('2026-09-30T23:30:00-05:00')).toBe('2026-09-30');
  });

  it('2026-10-01 00:30-05 (05:30 UTC) cuenta como 1 de octubre', () => {
    expect(diaPeruDe('2026-10-01T05:30:00+00:00')).toBe('2026-10-01');
    expect(diaPeruDe('2026-10-01T00:30:00-05:00')).toBe('2026-10-01');
  });

  it('el límite: 04:59:59 UTC es aún el día anterior, 05:00:00 UTC ya es el siguiente', () => {
    expect(diaPeruDe('2026-10-01T04:59:59Z')).toBe('2026-09-30');
    expect(diaPeruDe('2026-10-01T05:00:00Z')).toBe('2026-10-01');
  });
});
