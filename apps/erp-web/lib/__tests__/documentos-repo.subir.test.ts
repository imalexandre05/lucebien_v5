// @ts-nocheck — vitest no es dependencia declarada de erp-web y el typecheck incluye `**/*.ts`.
//
// QUÉ PRUEBA (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §4): la extensión del
// nombre del archivo no se copia tal cual al `storage_path`. Un nombre como «a.b/../x» no puede
// meter separadores de ruta en la clave de Storage.
import { describe, expect, it, vi } from 'vitest';

let ruta = '';
vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    from: () => ({
      insert: (fila: Record<string, unknown>) => {
        ruta = fila.storage_path as string;
        return { select: () => ({ single: async () => ({ data: { id: 'd1', ...fila }, error: null }) }) };
      },
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));

import { subirDocumento } from '../documentos-repo';

const archivo = (nombre: string) => new File(['x'], nombre, { type: 'application/pdf' });

describe('subirDocumento — extensión saneada', () => {
  it('conserva una extensión normal', async () => {
    await subirDocumento('e1', archivo('dni.PDF'));
    expect(ruta).toMatch(/^e1\/[0-9a-f-]{36}\.PDF$/);
  });
  it('descarta una extensión con separadores de ruta', async () => {
    await subirDocumento('e1', archivo('a.b/../../x'));
    expect(ruta).toMatch(/^e1\/[0-9a-f-]{36}$/);
  });
});
