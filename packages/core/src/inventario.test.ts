import { describe, it, expect } from 'vitest';
import {
  formatCodigo,
  parseCodigo,
  precioPorUso,
  familiaDeActivo,
  activoBloqueadoPor,
  activoSchema,
  type ReglaPrecioUso,
  type NodoFamilia,
} from './inventario';

describe('codificación TN-042', () => {
  it('formatea con padding y normaliza a mayúsculas', () => {
    expect(formatCodigo('tn', 42)).toBe('TN-042');
    expect(formatCodigo('CM', 8)).toBe('CM-008');
  });
  it('parsea válidos y rechaza basura', () => {
    expect(parseCodigo('TN-042')).toEqual({ tipo: 'TN', n: 42 });
    expect(parseCodigo('tn-042')).toEqual({ tipo: 'TN', n: 42 });
    expect(parseCodigo('basura')).toBeNull();
  });
  // Fase 7: el despiece antepone A/B al código del padre (ST-501 → AST-501/BST-501). Con un tipo
  // base de 3 letras, la pieza queda en 4 (ATNC-501) — {2,3} lo rechazaba, {2,4} lo acepta.
  it('parsea códigos de piezas despiezadas (4 letras)', () => {
    expect(parseCodigo('AST-501')).toEqual({ tipo: 'AST', n: 501 });
    expect(parseCodigo('BST-501')).toEqual({ tipo: 'BST', n: 501 });
    expect(parseCodigo('ATNC-501')).toEqual({ tipo: 'ATNC', n: 501 });
  });
  it('sigue rechazando 5+ letras', () => {
    expect(parseCodigo('ABCDE-501')).toBeNull();
  });
  it('activoSchema acepta código de 4 letras y rechaza 5', () => {
    const base = { tipo: 'AST', sedeCod: 'LB' };
    expect(activoSchema.safeParse({ ...base, codigo: 'AST-501' }).success).toBe(true);
    expect(activoSchema.safeParse({ ...base, codigo: 'ABCDE-501' }).success).toBe(false);
  });
});

describe('despiece saco/pantalón — familia y bloqueo (Fase 7)', () => {
  type Act = NodoFamilia & { id: string; codigo: string; estado: string };
  // Terno TN-042 (padre) despiezado en ASaco (hijo) + BPantalón (hijo).
  const padre: Act = { id: 'p', codigo: 'TN-042', activoPadreId: null, estado: 'disponible' };
  const saco: Act = { id: 's', codigo: 'ATN-042', activoPadreId: 'p', estado: 'disponible' };
  const pantalon: Act = { id: 'b', codigo: 'BTN-042', activoPadreId: 'p', estado: 'disponible' };
  const otro: Act = { id: 'x', codigo: 'CM-001', activoPadreId: null, estado: 'disponible' };
  const activos = [padre, saco, pantalon, otro];

  it('familiaDeActivo del padre incluye a ambos hijos', () => {
    const fam = familiaDeActivo(activos, 'p').map((a) => a.id).sort();
    expect(fam).toEqual(['b', 'p', 's']);
  });
  it('familiaDeActivo de un hijo incluye al padre pero NO al hermano', () => {
    const fam = familiaDeActivo(activos, 's').map((a) => a.id).sort();
    expect(fam).toEqual(['p', 's']); // sin 'b' (el pantalón, hermano)
  });
  it('activo sin relación devuelve solo self', () => {
    expect(familiaDeActivo(activos, 'x').map((a) => a.id)).toEqual(['x']);
  });
  it('id inexistente devuelve []', () => {
    expect(familiaDeActivo(activos, 'no-existe')).toEqual([]);
  });

  // El corazón del requisito: alquilar el saco bloquea el terno completo, pero el pantalón sigue
  // libre — la asimetría no es un bug, es la regla.
  it('alquilar el saco bloquea al padre (terno completo)', () => {
    const conSacoAlquilado = activos.map((a) => (a.id === 's' ? { ...a, estado: 'alquilado' } : a));
    const bloqueoPadre = activoBloqueadoPor(conSacoAlquilado, 'p');
    expect(bloqueoPadre?.id).toBe('s');
  });
  it('alquilar el saco NO bloquea al pantalón (hermano)', () => {
    const conSacoAlquilado = activos.map((a) => (a.id === 's' ? { ...a, estado: 'alquilado' } : a));
    const bloqueoPantalon = activoBloqueadoPor(conSacoAlquilado, 'b');
    expect(bloqueoPantalon).toBeNull();
  });
  it('alquilar el padre (terno completo) bloquea ambos hijos', () => {
    const conPadreAlquilado = activos.map((a) => (a.id === 'p' ? { ...a, estado: 'alquilado' } : a));
    expect(activoBloqueadoPor(conPadreAlquilado, 's')?.id).toBe('p');
    expect(activoBloqueadoPor(conPadreAlquilado, 'b')?.id).toBe('p');
  });
  it('nada bloqueado cuando todos están disponibles', () => {
    expect(activoBloqueadoPor(activos, 'p')).toBeNull();
    expect(activoBloqueadoPor(activos, 's')).toBeNull();
    expect(activoBloqueadoPor(activos, 'b')).toBeNull();
  });
  it('vendido también bloquea (no solo alquilado)', () => {
    const conVenta = activos.map((a) => (a.id === 's' ? { ...a, estado: 'vendido' } : a));
    expect(activoBloqueadoPor(conVenta, 'p')?.id).toBe('s');
  });
});

describe('precioPorUso (configurable, E3)', () => {
  // Valores de PRUEBA (no son la regla real de LuceBien; testean el mecanismo).
  const regla: ReglaPrecioUso = {
    escalones: [
      { desdeUsos: 5, descuentoPct: 0.1 },
      { desdeUsos: 10, descuentoPct: 0.5 },
    ],
    pisoPct: 0.6,
  };
  it('sin usos no descuenta', () => expect(precioPorUso(100, 0, regla)).toBe(100));
  it('aplica el escalón mayor alcanzado', () => expect(precioPorUso(100, 6, regla)).toBe(90));
  it('respeta el piso', () => expect(precioPorUso(100, 12, regla)).toBe(60));
});
