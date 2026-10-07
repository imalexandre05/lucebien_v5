// @ts-nocheck
//
// POR QUÉ `@ts-nocheck`. `apps/erp-web/tsconfig.json` incluye `**/*.ts` sin excepción, y
// `tools/verificar-local.sh` corre ese typecheck completo antes de cada commit. `vitest` es
// devDependency de `packages/core` (que sí tiene su runner wireado), pero NO está declarado como
// dependencia de `apps/erp-web` — así que `import ... from 'vitest'` no resuelve sus tipos desde
// acá, y sin este comentario el typecheck de erp-web se pondría rojo por un archivo de test, no por
// el código de producción. Declarar `vitest` como dependencia real de erp-web exige `pnpm install`
// (tocar `package.json` + el lockfile), que es más de lo que pide agregar un test — y este repo ya
// pagó caro un `pnpm install --force` (ver docs/aprendizajes.md, sección «Entorno de esta PC»).
// `@ts-nocheck` no afecta la EJECUCIÓN: vitest transpila con esbuild (sólo borra tipos, no los
// valida) y este archivo SÍ corre de verdad — se ejecutó contra el código real de sueldos-repo.ts
// antes de reportar la tarea como terminada, apuntando node directo al vitest.mjs que packages/core
// ya usa (mismo truco de tools/verificar-local.sh para encontrar tsc): no hizo falta instalar nada.
//
// QUÉ PRUEBA. `corregirLiquidacion()` habla con Supabase a través de tres funciones
// (`obtenerLiquidacion`, `anularLiquidacion`, `crearBorrador`) que no se pueden ejercitar sin una
// base real. Estos tests inyectan las tres como falsos, vía el tercer parámetro que
// `corregirLiquidacion` expone SÓLO para esto (ver su comentario en sueldos-repo.ts), y prueban lo
// que se puede probar sin base real (spec 2026-08-25-reunion-admin-hoja-de-ruta.md §3.1):
//   - el orden es SIEMPRE leer → anular → crear, nunca al revés;
//   - el acuerdo y el período que recibe `crearBorrador()` son los de la PROPIA liquidación leída
//     de la base — no un valor inventado, ni el que el cliente tenga cargado en otro lado;
//   - si `crearBorrador()` falla DESPUÉS de que la anulación ya corrió, el error dice exactamente
//     eso (`CorreccionParcialError`) y no esconde que la anulación quedó firme;
//   - una liquidación que no existe, o que no está 'cerrada', corta ANTES de anular o crear nada.
import { describe, expect, it, vi } from 'vitest';

// `sueldos-repo.ts` importa estos dos módulos a nivel de archivo, y los dos son de servidor:
// `./directorio` usa `cache()` de React (Server Components — no anda en el entorno Node llano de
// vitest, revienta con "cache is not a function" apenas se importa) y `./supabase/server` usa
// `next/headers`. Ninguno de los dos hace falta para lo que se prueba acá: `corregirLiquidacion`
// nunca llama a las funciones reales (siempre se le inyectan `obtener`/`anular`/`crear` falsos), así
// que se mockean ANTES de importar sueldos-repo.ts para que el archivo se pueda cargar en absoluto.
vi.mock('../directorio', () => ({
  mapaNombres: vi.fn(async () => new Map()),
}));
vi.mock('../supabase/server', () => ({
  getServerClient: vi.fn(() => {
    throw new Error('getServerClient() no debería llamarse: todo pasa por los colaboradores inyectados.');
  }),
}));

import {
  corregirLiquidacion,
  CorreccionParcialError,
  SueldoRpcError,
  type LiquidacionDetalle,
} from '../sueldos-repo';

// `corregirLiquidacion` sólo lee 4 campos de lo que devuelve `obtenerLiquidacion` (estado,
// acuerdoId, periodoDesde, periodoHasta) — el resto de `LiquidacionDetalle` (los tres jsonb, los
// escalares de dinero, etc.) no le importa a esta función, así que el fixture no los completa.
function liquidacionCerrada(extra: Partial<LiquidacionDetalle> = {}): LiquidacionDetalle {
  return {
    id: 'liq-1',
    acuerdoId: 'acuerdo-1',
    empleadoId: 'empleado-1',
    periodoDesde: '2026-07-01',
    periodoHasta: '2026-07-31',
    estado: 'cerrada',
    // La cuota con la que se pagó: corregir NO la recalcula con las reglas de hoy (0120).
    entrada: { sueldoPactado: 650 },
    ...extra,
  } as LiquidacionDetalle;
}

describe('corregirLiquidacion — anula y vuelve a emitir en un solo paso (D-1)', () => {
  it('lee, anula y RECIÉN DESPUÉS crea, con el acuerdo y el período de la propia liquidación', async () => {
    const orden: string[] = [];
    const obtener = vi.fn(async () => {
      orden.push('obtener');
      return liquidacionCerrada();
    });
    const anular = vi.fn(async () => {
      orden.push('anular');
    });
    const crear = vi.fn(async () => {
      orden.push('crear');
      return 'borrador-nuevo-1';
    });

    const r = await corregirLiquidacion('liq-1', '  se cargó un adelanto de más  ', {
      obtener,
      anular,
      crear,
    });

    expect(orden).toEqual(['obtener', 'anular', 'crear']);
    expect(anular).toHaveBeenCalledWith('liq-1', '  se cargó un adelanto de más  ');
    // El acuerdo y el período van EXACTOS a los de la liquidación que se corrige — nunca un rango
    // que el cliente pudiera tener cargado en el selector de "Calcular" de la pantalla.
    // …y con la MISMA cuota que tenía la liquidación: una corrección cambia datos, no la cuota
    // (si no, un cambio de frecuencia posterior reescribiría un mes ya pagado).
    expect(crear).toHaveBeenCalledWith('acuerdo-1', '2026-07-01', '2026-07-31', 650);
    expect(r).toEqual({ nuevoBorradorId: 'borrador-nuevo-1' });
  });

  it('si la liquidación no existe, corta con DATO y no anula ni crea nada', async () => {
    const obtener = vi.fn(async () => null);
    const anular = vi.fn();
    const crear = vi.fn();

    const error = await corregirLiquidacion('liq-x', 'motivo', { obtener, anular, crear }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(SueldoRpcError);
    expect(error.codigo).toBe('DATO');
    expect(anular).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it('si la liquidación no está cerrada, corta con ESTADO y no anula ni crea nada', async () => {
    const obtener = vi.fn(async () => liquidacionCerrada({ estado: 'borrador' }));
    const anular = vi.fn();
    const crear = vi.fn();

    const error = await corregirLiquidacion('liq-1', 'motivo', { obtener, anular, crear }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(SueldoRpcError);
    expect(error.codigo).toBe('ESTADO');
    expect(anular).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  it('si crear falla DESPUÉS de anular, la anulación ya corrió y el error lo dice explícito', async () => {
    const obtener = vi.fn(async () => liquidacionCerrada());
    const anular = vi.fn(async () => {});
    const crear = vi.fn(async () => {
      throw new Error('el período pedido se sale del acuerdo');
    });

    const error = await corregirLiquidacion('liq-1', '  motivo real  ', {
      obtener,
      anular,
      crear,
    }).catch((e) => e);

    // La anulación SÍ se ejecutó: no se saltea, y no hay forma de revertirla después.
    expect(anular).toHaveBeenCalledWith('liq-1', '  motivo real  ');
    expect(error).toBeInstanceOf(CorreccionParcialError);
    expect(error.motivoAnulacion).toBe('motivo real');
    expect(error.acuerdoId).toBe('acuerdo-1');
    expect(error.periodoDesde).toBe('2026-07-01');
    expect(error.periodoHasta).toBe('2026-07-31');
    expect(error.message).toContain('el período pedido se sale del acuerdo');
  });
});
