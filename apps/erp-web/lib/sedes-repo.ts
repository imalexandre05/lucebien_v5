import { cache } from 'react';
import type { SedePerfil } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient, adminConfigurado } from './supabase/admin';

// Catálogo de sedes (configurable): el jefe puede crear sedes nuevas y asignarles
// actividades/layout. Lectura para autenticados; escritura admin (RLS 0029).
//
// `perfil` (Fase 2, migración 0051) reemplaza a `interna` como fuente de verdad de qué tipo de
// operación tiene la sede — 'pos' (mostrador: pedidos + caja) o 'almacen' (pipeline + solicitudes,
// sin mostrador). `interna` se conserva en el tipo por compatibilidad de lectura (queda derivada
// por trigger en BD: interna = perfil === 'almacen'), pero la app ya NO la escribe directo.
export type Sede = { cod: string; nombre: string; direccion: string; perfil: SedePerfil; interna: boolean };

const perfilDeInterna = (interna: boolean): SedePerfil => (interna ? 'almacen' : 'pos');

// Fallback si el service_role no está configurado (p. ej. preview sin la env).
const SEDES_FALLBACK: Sede[] = [
  { cod: 'LB', nombre: 'Lucebien', direccion: '', perfil: 'pos', interna: false },
  { cod: 'ST', nombre: 'Stand', direccion: '', perfil: 'pos', interna: false },
  { cod: 'TR', nombre: 'Trece', direccion: '', perfil: 'pos', interna: false },
  { cod: 'AL', nombre: 'Almacén Central', direccion: '', perfil: 'almacen', interna: true },
];

/** Sedes para el login (sin sesión): solo cod+nombre, vía service role. */
export async function listarSedesPublico(): Promise<Pick<Sede, 'cod' | 'nombre'>[]> {
  if (!adminConfigurado()) return SEDES_FALLBACK;
  try {
    const { data, error } = await getAdminClient().from('sedes').select('cod, nombre').order('cod');
    if (error || !data?.length) return SEDES_FALLBACK;
    return data.map((r) => ({ cod: String(r.cod), nombre: String(r.nombre ?? r.cod) }));
  } catch {
    return SEDES_FALLBACK;
  }
}

export async function listarSedes(): Promise<Sede[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('sedes').select('cod, nombre, direccion, interna, perfil').order('cod');
  if (!error) {
    return ((data as Record<string, unknown>[]) ?? []).map((r) => {
      const interna = Boolean(r.interna);
      const perfil = r.perfil as SedePerfil | null;
      return {
        cod: String(r.cod),
        nombre: String(r.nombre ?? ''),
        direccion: String(r.direccion ?? ''),
        perfil: perfil === 'pos' || perfil === 'almacen' ? perfil : perfilDeInterna(interna),
        interna,
      };
    });
  }
  // Puente defensivo (Fase 2): si la migración 0051 (columna sedes.perfil) todavía no se aplicó
  // en este entorno, no tumbar toda pantalla que liste sedes — reintentar sin `perfil` y derivarlo
  // de `interna`. Mismo patrón que getSesion() en lib/auth.ts para rol_cod (Fase 1).
  const { data: fallback, error: e2 } = await sb.from('sedes').select('cod, nombre, direccion, interna').order('cod');
  if (e2) throw new Error(e2.message);
  return ((fallback as Record<string, unknown>[]) ?? []).map((r) => {
    const interna = Boolean(r.interna);
    return {
      cod: String(r.cod),
      nombre: String(r.nombre ?? ''),
      direccion: String(r.direccion ?? ''),
      perfil: perfilDeInterna(interna),
      interna,
    };
  });
}

export type SedeInput = { cod: string; nombre: string; direccion: string; perfil: SedePerfil };

export async function crearSede(p: SedeInput): Promise<void> {
  const sb = getServerClient();
  const base = { cod: p.cod.trim().toUpperCase(), nombre: p.nombre.trim(), direccion: p.direccion.trim() };
  const { error } = await sb.from('sedes').insert({ ...base, perfil: p.perfil });
  if (!error) return;
  // Sin `perfil` en BD todavía (0051 pendiente): cae a escribir `interna` directo, el único campo
  // que existía antes de esta fase — la sede queda funcional, solo sin el perfil fino hasta migrar.
  const { error: e2 } = await sb.from('sedes').insert({ ...base, interna: p.perfil === 'almacen' });
  if (e2) throw new Error(e2.message);
}

export async function editarSede(cod: string, p: Omit<SedeInput, 'cod'>): Promise<void> {
  const sb = getServerClient();
  const base = { nombre: p.nombre.trim(), direccion: p.direccion.trim() };
  const { error } = await sb.from('sedes').update({ ...base, perfil: p.perfil }).eq('cod', cod);
  if (!error) return;
  const { error: e2 } = await sb.from('sedes').update({ ...base, interna: p.perfil === 'almacen' }).eq('cod', cod);
  if (e2) throw new Error(e2.message);
}

// Perfil de UNA sede (topbar/sidebar: solo necesitan la sede activa, no el catálogo completo).
// cache(): layout.tsx y topbar.tsx la piden ambos en el mismo render → una sola ida a la BD.
export const getPerfilSede = cache(async (sedeCod: string): Promise<SedePerfil | null> => {
  if (!sedeCod) return null;
  const sb = getServerClient();
  const { data, error } = await sb.from('sedes').select('perfil, interna').eq('cod', sedeCod).maybeSingle();
  if (!error) {
    if (!data) return null;
    const perfil = (data as Record<string, unknown>).perfil as SedePerfil | null;
    if (perfil === 'pos' || perfil === 'almacen') return perfil;
    return perfilDeInterna(Boolean((data as Record<string, unknown>).interna));
  }
  const { data: fallback } = await sb.from('sedes').select('interna').eq('cod', sedeCod).maybeSingle();
  return fallback ? perfilDeInterna(Boolean((fallback as Record<string, unknown>).interna)) : null;
});
