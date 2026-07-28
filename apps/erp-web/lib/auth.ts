import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Sesion } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';

// Exportada (Fase 2): la reutilizan el switcher de sede del topbar (components/shell/sede-
// actions.ts) y el login — antes solo vivía aquí como constante local.
export const SEDE_COOKIE = 'sci_sede';
// Exportado (Fase 1): lo reutilizan crearEmpleado() (empleados-repo.ts) y la reautenticación
// (lib/reauth.ts) — antes solo vivía aquí y se hubiera vuelto a duplicar en cada archivo nuevo.
export const EMAIL_DOMAIN = 'lucebien.local';

// "El dispositivo manda" (Fase 2): fija la sede activa en una cookie httpOnly de sesión. La usan
// el login (ambos modos) y el switcher del topbar — un único punto que decide cómo se persiste.
export function fijarSedeActiva(sede: string): void {
  if (!sede) return;
  cookies().set(SEDE_COOKIE, sede, { httpOnly: true, sameSite: 'lax', path: '/' });
}

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
  fijarSedeActiva(sede);
  return { ok: true };
}

// LOGIN_V2: usuario (empleados.nombre) + contraseña real. Se conserva el mismo email interno
// {cod}@lucebien.local — cod nunca se pide ni se muestra, queda como PIN de atribución interno
// (ya usado desde Fase 2). La búsqueda del empleado usa el cliente admin (bypassa RLS) porque
// corre ANTES de que exista sesión — mismo patrón que listarSedesPublico() en sedes-repo.ts.
// Mensaje de error genérico en ambos casos (usuario inexistente o contraseña incorrecta) para no
// filtrar qué usuarios existen.
// `sede` (Fase 2, "el dispositivo manda"): opcional — el login la pre-marca con la sede del
// equipo y la manda tal cual la eligió el usuario. Si no llega (o llega vacía), getSesion() sigue
// cayendo a empleados.sede_cod como antes; no es un campo de seguridad, solo la sede activa.
export async function loginConUsuario(
  usuario: string,
  password: string,
  sede?: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = getAdminClient();
  const { data: emp } = await admin.from('empleados').select('cod').ilike('nombre', usuario.trim()).maybeSingle();
  if (!emp) return { ok: false, error: 'Usuario o contraseña incorrectos' };

  const sb = getServerClient();
  const { error } = await sb.auth.signInWithPassword({
    email: `${(emp as { cod: string }).cod}@${EMAIL_DOMAIN}`,
    password,
  });
  if (error) return { ok: false, error: 'Usuario o contraseña incorrectos' };
  if (sede) fijarSedeActiva(sede);
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

  const [empRes, { data: tiendas }] = await Promise.all([
    sb.from('empleados').select('id, nombre, rol, rol_cod, sede_cod').eq('id', user.id).maybeSingle(),
    sb.from('empleado_tiendas').select('sede_cod').eq('empleado_id', user.id),
  ]);

  let emp = empRes.data as Record<string, unknown> | null;
  if (empRes.error) {
    // Puente defensivo (Fase 1): si la migración 0050 (columna empleados.rol_cod) todavía no se
    // aplicó en este entorno, no tumbar TODA la sesión de TODOS por una columna que falta —
    // reintentar sin rol_cod. Se auto-desactiva solo (deja de entrar aquí) en cuanto la migración
    // corra; no borrar esto antes de confirmar que 0050 está aplicada en producción.
    const { data: fallback } = await sb
      .from('empleados')
      .select('id, nombre, rol, sede_cod')
      .eq('id', user.id)
      .maybeSingle();
    emp = fallback as Record<string, unknown> | null;
  }
  if (!emp) return null;

  const sedeActiva = cookies().get(SEDE_COOKIE)?.value || (emp.sede_cod as string) || '';
  const lista = (tiendas ?? []).map((t) => t.sede_cod as string);
  return {
    nombre: emp.nombre as string,
    usuario: {
      id: emp.id as string,
      rol: emp.rol as Sesion['usuario']['rol'],
      rolCod: (emp.rol_cod as string | null | undefined) ?? null,
      sede: sedeActiva,
      tiendas: lista.length ? lista : sedeActiva ? [sedeActiva] : [],
    },
  };
});
