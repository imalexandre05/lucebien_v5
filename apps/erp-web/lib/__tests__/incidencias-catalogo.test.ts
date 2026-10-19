// @ts-nocheck  (vitest no es dependencia de erp-web; ver sueldos-repo.corregir.test.ts)
// QUÉ PRUEBA (spec 2026-10-18-incidencias-servidor-valida-design.md §2): los puntos de penalidad
// salen siempre del catálogo, nunca del navegador, y un tipo desconocido se rechaza.
import { describe, expect, it } from 'vitest';
import { resolverIncidencia } from '../incidencias-catalogo';

const tipos = [
  { id: '1', tipo: 'Llegada tarde', categoria: 'Puntualidad', nivelDefault: 'Bajo', puntosDefault: 2 },
  { id: '2', tipo: 'Daño a prenda', categoria: 'Calidad', nivelDefault: 'Alto', puntosDefault: 10 },
];

describe('resolverIncidencia', () => {
  it('toma los puntos del catálogo', () => {
    expect(resolverIncidencia(tipos, 'Daño a prenda', 'Alto')).toEqual({ ok: true, nivel: 'Alto', puntosPenalidad: 10 });
  });
  it('un nivel válido enviado se respeta; uno inválido cae al del tipo', () => {
    expect(resolverIncidencia(tipos, 'Llegada tarde', 'Medio')).toMatchObject({ ok: true, nivel: 'Medio', puntosPenalidad: 2 });
    expect(resolverIncidencia(tipos, 'Llegada tarde', 'Catastrófico')).toMatchObject({ ok: true, nivel: 'Bajo' });
    expect(resolverIncidencia(tipos, 'Llegada tarde', '')).toMatchObject({ ok: true, nivel: 'Bajo' });
  });
  it('rechaza un tipo que no está en el catálogo', () => {
    const r = resolverIncidencia(tipos, 'Inventado', 'Alto');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no existe o está desactivado/);
  });
});

// Responsable de la sede (spec §Responsable validado).
import { responsableValido } from '../incidencias-catalogo';

describe('responsableValido', () => {
  const emp = { activo: true, sedeCod: 'S1', sedes: ['S1', 'S2'] };
  it('acepta null (sin responsable)', () => expect(responsableValido(null, 'S1')).toBe(true));
  it('acepta a una persona activa de la sede, también por empleado_tiendas', () => {
    expect(responsableValido(emp, 'S1')).toBe(true);
    expect(responsableValido(emp, 'S2')).toBe(true);
  });
  it('rechaza a una persona de otra sede o suspendida', () => {
    expect(responsableValido(emp, 'S3')).toBe(false);
    expect(responsableValido({ ...emp, activo: false }, 'S1')).toBe(false);
  });
});
