'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase/server';

// Cambios de estado de un equipo (admin). La RPC dispositivo_set_estado valida app_es_admin().
async function setEstado(id: string, estado: string) {
  if (!id) return;
  const sb = getServerClient();
  await sb.rpc('dispositivo_set_estado', { p_id: id, p_estado: estado });
  revalidatePath('/dispositivos');
}

export async function accionAprobar(formData: FormData) {
  await setEstado(String(formData.get('id') ?? ''), 'aprobado');
}
export async function accionRechazar(formData: FormData) {
  await setEstado(String(formData.get('id') ?? ''), 'rechazado');
}
export async function accionRevocar(formData: FormData) {
  await setEstado(String(formData.get('id') ?? ''), 'revocado');
}
