import { getServerClient } from './supabase/server';

export type ConfigItem = { clave: string; valor: string };

// Defaults de horas de cierre de turno (Fase 4 tarea 5): MISMOS valores que regían hardcodeados
// en packages/db/migrations/0021_reportes_auto_cierre.sql antes de esa fase. Compartido entre
// /reportes/nuevo (cuenta regresiva del formulario) y el dashboard (panel de cobertura, Fase 6) —
// no es una hora confirmada por el dueño, ver docs/pendientes-negocio.md.
export const CIERRE_TURNO_DEFAULT = { M: '15:00', T: '23:00', C: '23:00' } as const;

export async function listarConfig(): Promise<ConfigItem[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('config').select('clave, valor').order('clave');
  if (error) throw new Error(error.message);
  return ((data as { clave: string; valor: string | null }[]) ?? []).map((c) => ({
    clave: c.clave,
    valor: c.valor ?? '',
  }));
}

export async function guardarConfig(items: ConfigItem[]): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('config').upsert(items, { onConflict: 'clave' });
  if (error) throw new Error(error.message);
}

// Lee un mapa clave→valor (para cálculos que dependen de config, p. ej. la nota de evaluación).
export async function leerConfigMap(): Promise<Record<string, string>> {
  const items = await listarConfig();
  return Object.fromEntries(items.map((i) => [i.clave, i.valor]));
}
