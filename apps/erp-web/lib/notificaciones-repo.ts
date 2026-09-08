import { getServerClient } from './supabase/server';

// Notificaciones internas (S21). Un solo motor: la función SQL `generar_alertas()`
// (migraciones 0042/0046/0052/0100/0101/0107/0109), que corre el cron dos veces al día Y el botón
// manual del administrador (generarAlertasAction() → generarAlertas() acá abajo). Antes había una
// segunda copia de las reglas en TypeScript (packages/core/src/alertas.ts) que el botón corría por
// su cuenta; se borró en la 0109 (C-3 de la spec de notificaciones) porque las dos copias ya
// divergían: esa copia sólo tenía las 5 reglas viejas, nunca se actualizó con las 6 nuevas de la
// 0107, y el botón manual daba un resultado distinto al del cron.

export type Notificacion = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  severidad: 'info' | 'warn' | 'critica';
  sede: string | null;
  refTipo: string | null;
  refId: string | null;
  leida: boolean;
  createdAt: string;
};

const SEL = 'id, tipo, titulo, mensaje, severidad, destinatario_sede, ref_tipo, ref_id, leida, created_at';

function fromRow(r: Record<string, unknown>): Notificacion {
  const sev = r.severidad;
  return {
    id: String(r.id),
    tipo: String(r.tipo),
    titulo: String(r.titulo),
    mensaje: String(r.mensaje),
    severidad: sev === 'critica' || sev === 'warn' ? sev : 'info',
    sede: (r.destinatario_sede as string | null) ?? null,
    refTipo: (r.ref_tipo as string | null) ?? null,
    refId: (r.ref_id as string | null) ?? null,
    leida: Boolean(r.leida),
    createdAt: String(r.created_at ?? ''),
  };
}

export async function listarNotificaciones(soloNoLeidas = false, limit = 100): Promise<Notificacion[]> {
  const sb = getServerClient();
  let q = sb.from('notificaciones').select(SEL).order('leida').order('created_at', { ascending: false }).limit(limit);
  if (soloNoLeidas) q = q.eq('leida', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
}

export async function contarNoLeidas(): Promise<number> {
  const sb = getServerClient();
  const { count, error } = await sb.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function marcarLeida(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('notificaciones').update({ leida: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function marcarTodasLeidas(): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('notificaciones').update({ leida: true, updated_at: new Date().toISOString() }).eq('leida', false);
  if (error) throw new Error(error.message);
}

// Llama al único motor de reglas: la función SQL `generar_alertas()` (0109). Ella misma exige
// administrador por dentro (`private.app_es_admin()`, `raise exception 'PERMISO:...'` si no) —
// ese guard es el que de verdad importa; el de generarAlertasAction() en el server action es
// cinturón, no la única defensa. Devuelve cuántas filas insertó o refrescó (no cuántas son nuevas).
export async function generarAlertas(): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('generar_alertas');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
