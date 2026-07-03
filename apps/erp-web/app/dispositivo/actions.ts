'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase/server';

const DEVICE_COOKIE = 'sci_device';

// Autoaprobación de un admin: aprueba el equipo ACTUAL (bootstrap sin lock-out). La RPC valida
// app_es_admin() adentro, así que un no-admin no puede aprobarse.
export async function autorizarEsteEquipo() {
  const deviceId = cookies().get(DEVICE_COOKIE)?.value;
  if (!deviceId) redirect('/dispositivo?error=token');
  const sb = getServerClient();
  const { error } = await sb.rpc('dispositivo_autoaprobar', { p_device_id: deviceId });
  if (error) redirect('/dispositivo?error=permiso');
  redirect('/');
}

// Un no-admin solicita acceso: registra/actualiza el equipo como 'pendiente' con un nombre.
export async function solicitarAcceso(formData: FormData) {
  const deviceId = cookies().get(DEVICE_COOKIE)?.value;
  if (!deviceId) redirect('/dispositivo?error=token');
  const nombre = String(formData.get('nombre') ?? '').slice(0, 80);
  const sb = getServerClient();
  await sb.rpc('dispositivo_registrar', {
    p_device_id: deviceId,
    p_nombre: nombre,
    p_user_agent: '',
    p_sede: '',
  });
  revalidatePath('/dispositivo');
  redirect('/dispositivo?solicitado=1');
}
