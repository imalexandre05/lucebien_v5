'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '../../lib/supabase/server';
import { actualizarSedeDispositivo, actualizarCompartidoDispositivo } from '../../lib/dispositivos-repo';

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

// Asigna la sede que este equipo pre-marca en el login (Fase 2: "el dispositivo manda").
export async function accionCambiarSede(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const sede = String(formData.get('sede') ?? '');
  if (!id || !sede) return;
  await actualizarSedeDispositivo(id, sede);
  revalidatePath('/dispositivos');
}

// Equipo compartido: en la PC del almacén, abierta con una sola cuenta, cada movimiento del
// pipeline pide el código personal de quien lo hace. Sólo admin (la policy de la tabla lo exige).
export async function accionCambiarCompartido(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await actualizarCompartidoDispositivo(id, formData.get('compartido') === 'true');
  revalidatePath('/dispositivos');
}
