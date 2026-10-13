// @ts-nocheck  (vitest no es dependencia de erp-web; ver sueldos-repo.corregir.test.ts)
import { describe, expect, it } from 'vitest';
import { TAMANO_MAXIMO_BYTES, errorDeTamano } from '../documentos-tamano';

describe('errorDeTamano', () => {
  it('el tope es de 4 MB', () => {
    expect(TAMANO_MAXIMO_BYTES).toBe(4 * 1024 * 1024);
  });
  it('acepta un archivo justo en el tope', () => {
    expect(errorDeTamano(TAMANO_MAXIMO_BYTES)).toBeNull();
  });
  it('rechaza un byte por encima del tope', () => {
    expect(errorDeTamano(TAMANO_MAXIMO_BYTES + 1)).not.toBeNull();
  });
  it('el mensaje trae el tamaño real y la salida sugerida', () => {
    expect(errorDeTamano(6 * 1024 * 1024)).toBe(
      'El archivo pesa 6.0 MB; el máximo es 4 MB. Reduce la foto o súbelo como PDF.',
    );
  });
});
