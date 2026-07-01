import { getServerClient } from './supabase/server';

export type ConfigItem = { clave: string; valor: string };

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
