'use server';

import { verificarPasswordSesion } from '../../lib/reauth';

export async function accionReautenticar(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: 'Ingresa tu contraseña' };
  return verificarPasswordSesion(password);
}
