import { cookies } from 'next/headers';
import type { Sesion } from '@scilb/core';

const COOKIE = 'sci_sesion';

// Auth de DEMO (sin Supabase). Reemplazar por Supabase Auth: el login cod+sede valida contra
// auth + la tabla empleados (E2). El rol/sede salen del empleado, no se hardcodean en prod.
export async function login(cod: string, sede: string): Promise<Sesion> {
  const sesion: Sesion = {
    nombre: `Operario ${cod}`,
    usuario: { id: cod, rol: 'admin', sede, tiendas: [sede] },
  };
  cookies().set(COOKIE, JSON.stringify(sesion), { httpOnly: true, sameSite: 'lax', path: '/' });
  return sesion;
}

export async function logout() {
  cookies().delete(COOKIE);
}

export async function getSesion(): Promise<Sesion | null> {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  try {
    return JSON.parse(c.value) as Sesion;
  } catch {
    return null;
  }
}
