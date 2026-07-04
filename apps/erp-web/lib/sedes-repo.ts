import { getServerClient } from './supabase/server';

// Catálogo de sedes (configurable): el jefe puede crear sedes nuevas y asignarles
// actividades/layout. Lectura para autenticados; escritura admin (RLS 0029).
export type Sede = { cod: string; nombre: string; direccion: string; interna: boolean };

export async function listarSedes(): Promise<Sede[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('sedes').select('cod, nombre, direccion, interna').order('cod');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    cod: String(r.cod),
    nombre: String(r.nombre ?? ''),
    direccion: String(r.direccion ?? ''),
    interna: Boolean(r.interna),
  }));
}

export async function crearSede(p: Sede): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('sedes').insert({
    cod: p.cod.trim().toUpperCase(),
    nombre: p.nombre.trim(),
    direccion: p.direccion.trim(),
    interna: p.interna,
  });
  if (error) throw new Error(error.message);
}

export async function editarSede(cod: string, p: Omit<Sede, 'cod'>): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('sedes')
    .update({ nombre: p.nombre.trim(), direccion: p.direccion.trim(), interna: p.interna })
    .eq('cod', cod);
  if (error) throw new Error(error.message);
}
