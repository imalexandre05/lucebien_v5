import { describe, expect, it } from 'vitest';
import {
  ALFABETO_TEMPORAL,
  REGLAS_ACCESO_DEFAULT,
  estadoBloqueo,
  generarContrasenaTemporal,
  leerReglasAcceso,
  registrarFallo,
  validarContrasenaNueva,
  type EstadoIntentos,
} from './acceso';

// Spec: docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md §4–§6.

const base = { minimo: 8, cod: '4821', nombre: 'Rosa Quispe', actual: 'temporal-1' };

describe('validarContrasenaNueva (§4)', () => {
  it('acepta una frase larga sin el código ni el nombre', () => {
    expect(validarContrasenaNueva('mi terno azul 2026', base)).toEqual([]);
  });

  it('exige el mínimo configurado y lo dice con el número', () => {
    expect(validarContrasenaNueva('abc12', base)).toContain('Usa al menos 8 caracteres.');
    expect(validarContrasenaNueva('abcdefghij', { ...base, minimo: 12 })).toContain('Usa al menos 12 caracteres.');
  });

  it('rechaza más de 72 caracteres (bcrypt trunca en silencio)', () => {
    expect(validarContrasenaNueva('x'.repeat(40) + 'y'.repeat(33), base)).toContain('Usa como máximo 72 caracteres.');
  });

  it('rechaza contener el código de 4 dígitos', () => {
    expect(validarContrasenaNueva('4821', base)).toContain('No uses tu código de 4 dígitos dentro de la contraseña.');
    expect(validarContrasenaNueva('lucebien4821', base)).toContain(
      'No uses tu código de 4 dígitos dentro de la contraseña.',
    );
  });

  it('rechaza el nombre, sin importar mayúsculas ni espacios', () => {
    expect(validarContrasenaNueva('ROSAQUISPE', base)).toContain('No uses tu nombre como contraseña.');
    expect(validarContrasenaNueva('rosa quispe', base)).toContain('No uses tu nombre como contraseña.');
  });

  it('rechaza un solo carácter repetido', () => {
    expect(validarContrasenaNueva('aaaaaaaaa', base)).toContain('No repitas el mismo carácter: mezcla letras y números.');
    expect(validarContrasenaNueva('111111111', base)).toContain('No repitas el mismo carácter: mezcla letras y números.');
  });

  it('exige que sea distinta de la actual', () => {
    expect(validarContrasenaNueva('temporal-1', base)).toContain('La nueva contraseña tiene que ser distinta de la actual.');
  });

  it('sin código ni nombre conocidos, sólo aplica largo y repetición', () => {
    expect(validarContrasenaNueva('abcdefgh', { minimo: 8 })).toEqual([]);
  });
});

describe('leerReglasAcceso (§5)', () => {
  it('sin filas usa los defaults 8 / 5 / 15', () => {
    expect(leerReglasAcceso({})).toEqual({ contrasenaMin: 8, intentosMax: 5, bloqueoMin: 15 });
    expect(REGLAS_ACCESO_DEFAULT).toEqual({ contrasenaMin: 8, intentosMax: 5, bloqueoMin: 15 });
  });

  it('lee los valores editados', () => {
    expect(
      leerReglasAcceso({ acceso_contrasena_min: '10', acceso_intentos_max: '3', acceso_bloqueo_min: '60' }),
    ).toEqual({ contrasenaMin: 10, intentosMax: 3, bloqueoMin: 60 });
  });

  it('un valor ilegible o fuera de rango cae al default, nunca tumba el login', () => {
    expect(
      leerReglasAcceso({ acceso_contrasena_min: 'ocho', acceso_intentos_max: '0', acceso_bloqueo_min: '99999' }),
    ).toEqual(REGLAS_ACCESO_DEFAULT);
    expect(leerReglasAcceso({ acceso_contrasena_min: '5', acceso_intentos_max: '2.5', acceso_bloqueo_min: '' })).toEqual(
      REGLAS_ACCESO_DEFAULT,
    );
  });
});

describe('registrarFallo / estadoBloqueo (§5)', () => {
  const reglas = REGLAS_ACCESO_DEFAULT;
  const t0 = new Date('2026-10-06T15:00:00Z');
  const limpio: EstadoIntentos = { fallidos: 0, bloqueadoHasta: null };

  function fallar(n: number, ahora = t0): EstadoIntentos {
    let e = limpio;
    for (let i = 0; i < n; i++) e = registrarFallo(e, ahora, reglas);
    return e;
  }

  it('cuatro fallos no bloquean', () => {
    const e = fallar(4);
    expect(e).toEqual({ fallidos: 4, bloqueadoHasta: null });
    expect(estadoBloqueo(e, t0)).toEqual({ bloqueado: false, minutosRestantes: 0 });
  });

  it('el quinto bloquea 15 minutos y deja el contador en cero', () => {
    const e = fallar(5);
    expect(e.fallidos).toBe(0);
    expect(e.bloqueadoHasta).toBe('2026-10-06T15:15:00.000Z');
    expect(estadoBloqueo(e, t0)).toEqual({ bloqueado: true, minutosRestantes: 15 });
  });

  it('redondea hacia arriba los minutos que faltan', () => {
    const e = fallar(5);
    expect(estadoBloqueo(e, new Date('2026-10-06T15:14:01Z'))).toEqual({ bloqueado: true, minutosRestantes: 1 });
  });

  it('vence exactamente a los 15 minutos', () => {
    const e = fallar(5);
    expect(estadoBloqueo(e, new Date('2026-10-06T15:15:00Z')).bloqueado).toBe(false);
  });

  it('un bloqueo vencido arranca de cero', () => {
    const despues = new Date('2026-10-06T16:00:00Z');
    const e = registrarFallo(fallar(5), despues, reglas);
    expect(e).toEqual({ fallidos: 1, bloqueadoHasta: null });
  });

  it('respeta los parámetros editados', () => {
    const r = { contrasenaMin: 8, intentosMax: 3, bloqueoMin: 60 };
    let e = limpio;
    for (let i = 0; i < 3; i++) e = registrarFallo(e, t0, r);
    expect(e.bloqueadoHasta).toBe('2026-10-06T16:00:00.000Z');
  });

  it('una fecha de bloqueo ilegible no bloquea', () => {
    expect(estadoBloqueo({ fallidos: 0, bloqueadoHasta: 'basura' }, t0).bloqueado).toBe(false);
  });
});

describe('generarContrasenaTemporal (§6)', () => {
  // Fuente fija: devuelve los bytes de la lista en orden, en bucle.
  const fuente = (bytes: number[]) => {
    let i = 0;
    return (n: number) => {
      const out = new Uint8Array(n);
      for (let k = 0; k < n; k++) out[k] = bytes[i++ % bytes.length];
      return out;
    };
  };

  it('formato xxxx-xxxx con el alfabeto sin ambiguos', () => {
    const t = generarContrasenaTemporal(fuente([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(t).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(t).toBe(`${ALFABETO_TEMPORAL.slice(0, 4)}-${ALFABETO_TEMPORAL.slice(4, 8)}`);
  });

  it('el alfabeto no tiene caracteres que se confunden', () => {
    for (const c of '01oli') expect(ALFABETO_TEMPORAL).not.toContain(c);
  });

  it('descarta los bytes que darían sesgo (rejection sampling)', () => {
    const tope = 256 - (256 % ALFABETO_TEMPORAL.length);
    const t = generarContrasenaTemporal(fuente([255, tope, 0, 255, 1, 2, 3, 4, 5, 6, 7]));
    expect(t).toBe(`${ALFABETO_TEMPORAL.slice(0, 4)}-${ALFABETO_TEMPORAL.slice(4, 8)}`);
  });

  it('cumple las reglas de contraseña por defecto', () => {
    const t = generarContrasenaTemporal(fuente([3, 9, 14, 20, 7, 11, 25, 2]));
    expect(validarContrasenaNueva(t, { minimo: 8 })).toEqual([]);
  });
});
