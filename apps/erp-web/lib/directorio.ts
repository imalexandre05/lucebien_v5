import { getServerClient } from './supabase/server';

export type DirItem = { id: string; nombre: string; rol: string; sedeCod: string | null };

// Directorio de empleados (nombres/roles) visible para todos los autenticados, vía la función
// SECURITY DEFINER app_directorio (no expone salario/dni). Reemplaza los `from('empleados')`
// que un no-admin no podía leer (RLS lo limita a sí mismo).
export async function directorio(): Promise<DirItem[]> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('app_directorio');
  if (error) throw new Error(error.message);
  return ((data as { id: string; nombre: string; rol: string; sede_cod: string | null }[]) ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    rol: d.rol,
    sedeCod: d.sede_cod ?? null,
  }));
}

export async function mapaNombres(): Promise<Map<string, string>> {
  const items = await directorio();
  return new Map(items.map((d) => [d.id, d.nombre]));
}
