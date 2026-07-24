import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Sesion } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';

const SEDE_COOKIE = 'sci_sede';
const EMAIL_DOMAIN = 'lucebien.local';

// Login híbrido: el empleado entra con su código de 4 dígitos + sede.
// El código ES la credencial (Supabase Auth tiene el bcrypt del código importado del
// sistema viejo). La sede elegida se guarda como "sede activa" (filtros / sucursal por
// defecto), no como identidad — un empleado puede tener varias sedes.
export async function login(cod: string, sede: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getServerClient();
  const { error } = await sb.auth.signInWithPassword({
    email: `${cod}@${EMAIL_DOMAIN}`,
    password: cod,
  });
  if (error) return { ok: false, error: error.message };
  cookies().set(SEDE_COOKIE, sede, { httpOnly: true, sameSite: 'lax', path: '/' });
  return { ok: true };
}

// LOGIN_V2: usuario (empleados.nombre) + contraseña real. Se conserva el mismo email interno
// {cod}@lucebien.local — cod nunca se pide ni se muestra, queda como PIN de atribución interno
// (ya usado desde Fase 2). La búsqueda del empleado usa el cliente admin (bypassa RLS) porque
// corre ANTES de que exista sesión — mismo patrón que listarSedesPublico() en sedes-repo.ts.
// No se setea SEDE_COOKIE: getSesion() ya cae a empleados.sede_cod cuando no hay cookie.
// Mensaje de error genérico en ambos casos (usuario inexistente o contraseña incorrecta) para no
// filtrar qué usuarios existen.
export async function loginConUsuario(usuario: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const admin = getAdminClient();
  const { data: emp } = await admin.from('empleados').select('cod').ilike('nombre', usuario.trim()).maybeSingle();
  if (!emp) return { ok: false, error: 'Usuario o contraseña incorrectos' };

  const sb = getServerClient();
  const { error } = await sb.auth.signInWithPassword({
    email: `${(emp as { cod: string }).cod}@${EMAIL_DOMAIN}`,
    password,
  });
  if (error) return { ok: false, error: 'Usuario o contraseña incorrectos' };
  return { ok: true };
}

export async function logout(): Promise<void> {
  const sb = getServerClient();
  await sb.auth.signOut();
  cookies().delete(SEDE_COOKIE);
}

// Sesión actual: lee el usuario de Supabase Auth + su fila de empleados (con la RLS del
// propio usuario: auth.uid() = empleados.id). Devuelve null si no hay sesión.
// cache(): el layout (Topbar) y cada page la piden en el mismo render → una sola resolución.
// Los dos selects (empleado + tiendas) van en paralelo: una ida menos por navegación.
export const getSesion = cache(async (): Promise<Sesion | null> => {
  const sb = getServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: emp }, { data: tiendas }] = await Promise.all([
    sb.from('empleados').select('id, nombre, rol, sede_cod').eq('id', user.id).maybeSingle(),
    sb.from('empleado_tiendas').select('sede_cod').eq('empleado_id', user.id),
  ]);
  if (!emp) return null;

  const sedeActiva = cookies().get(SEDE_COOKIE)?.value || (emp.sede_cod as string) || '';
  const lista = (tiendas ?? []).map((t) => t.sede_cod as string);
  return {
    nombre: emp.nombre as string,
    usuario: {
      id: emp.id as string,
      rol: emp.rol as Sesion['usuario']['rol'],
      sede: sedeActiva,
      tiendas: lista.length ? lista : sedeActiva ? [sedeActiva] : [],
    },
  };
});
