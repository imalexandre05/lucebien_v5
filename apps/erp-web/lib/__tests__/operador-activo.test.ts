// @ts-nocheck
// vitest no está declarado en apps/erp-web (mismo motivo que sueldos-repo.corregir.test.ts): el typecheck
// no resuelve sus tipos, pero el test sí corre (tools/verificar-local.sh paso 4).
import { describe, expect, it } from 'vitest';
import {
  MINUTOS_OPERADOR_DEFECTO,
  cambiarOperador,
  msParaExpirar,
  nuevoOperador,
  operadorVigente,
  registrarActividad,
} from '../operador-activo';

const T0 = 1_000_000;
const MIN = 60_000;
const op = () => nuevoOperador({ token: 't-1', nombre: 'Ana', ventanaMin: 10 }, T0);

describe('operador activo del tablero compartido', () => {
  it('sigue vigente justo antes de los 10 minutos sin actividad', () => {
    expect(operadorVigente(op(), T0 + 10 * MIN - 1)?.nombre).toBe('Ana');
  });

  it('expira a los 10 minutos sin actividad', () => {
    expect(operadorVigente(op(), T0 + 10 * MIN)).toBeNull();
  });

  it('cada acción renueva la ventana', () => {
    const renovado = registrarActividad(op(), T0 + 9 * MIN);
    expect(operadorVigente(renovado, T0 + 18 * MIN)?.nombre).toBe('Ana');
    expect(operadorVigente(renovado, T0 + 19 * MIN)).toBeNull();
  });

  it('«cambiar» limpia el operador', () => {
    expect(operadorVigente(cambiarOperador(), T0)).toBeNull();
  });

  it('sin operador no hay nadie vigente ni tiempo restante', () => {
    expect(operadorVigente(null, T0)).toBeNull();
    expect(msParaExpirar(null, T0)).toBe(0);
  });

  it('usa la ventana que devuelve la base y, si no la hay, el default', () => {
    expect(nuevoOperador({ token: 't', nombre: 'B', ventanaMin: 3 }, T0).ventanaMs).toBe(3 * MIN);
    expect(nuevoOperador({ token: 't', nombre: 'B' }, T0).ventanaMs).toBe(MINUTOS_OPERADOR_DEFECTO * MIN);
    expect(nuevoOperador({ token: 't', nombre: 'B', ventanaMin: 0 }, T0).ventanaMs).toBe(MINUTOS_OPERADOR_DEFECTO * MIN);
  });

  it('msParaExpirar cuenta lo que falta y nunca baja de 0', () => {
    expect(msParaExpirar(op(), T0 + 4 * MIN)).toBe(6 * MIN);
    expect(msParaExpirar(op(), T0 + 30 * MIN)).toBe(0);
  });
});
