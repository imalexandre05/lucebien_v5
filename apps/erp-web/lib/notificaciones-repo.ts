import {
  alertasDevoluciones,
  alertasStock,
  alertasCajaSinCerrar,
  alertasReportesSinEvaluar,
  ordenarAlertas,
  type Alerta,
} from '@scilb/core';
import { getServerClient } from './supabase/server';

// Notificaciones internas (S21). La generación evalúa el estado con el motor de reglas del core
// y hace UPSERT (ignora las que ya existen por dedup_key) para no re-alertar lo ya visto/leído.
// Este es el camino MANUAL (botón admin). El camino AUTOMÁTICO (pg_cron) usa la función SQL
// `generar_alertas()` (migración 0042), espejo de esta lógica y del mismo dedup_key → ambos son
// idempotentes entre sí. Si cambian las reglas aquí o en core/alertas.ts, actualizar también 0042.

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

type Regla = { tipo: string; activa: boolean; umbral: number | null; destinatarioRol: string | null };

// Genera notificaciones evaluando el estado actual con el motor de reglas del core.
// Devuelve cuántas nuevas se crearon. Idempotente por dedup_key (no duplica ni re-alerta lo leído).
export async function generarAlertas(): Promise<number> {
  const sb = getServerClient();
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD

  const [reglasRes, pedidosRes, materialesRes, cajaRes, reportesRes] = await Promise.all([
    sb.from('alertas_reglas').select('tipo, activa, umbral, destinatario_rol'),
    sb.from('pedidos').select('id, fecha_devolucion, estado, sede_cod, clientes(nombre)'),
    sb.from('materiales').select('id, nombre, stock_actual, stock_minimo, sede_cod, activo'),
    sb.from('caja_sesiones').select('id, sede_cod, fecha, estado').eq('estado', 'abierta'),
    sb.from('reportes').select('id, sede_cod, fecha, evaluado, no_evaluable').eq('evaluado', false).order('fecha', { ascending: false }).limit(200),
  ]);
  for (const r of [reglasRes, pedidosRes, materialesRes, cajaRes, reportesRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const reglas = new Map<string, Regla>();
  for (const r of (reglasRes.data as Record<string, unknown>[]) ?? []) {
    reglas.set(String(r.tipo), {
      tipo: String(r.tipo),
      activa: Boolean(r.activa),
      umbral: r.umbral == null ? null : Number(r.umbral),
      destinatarioRol: (r.destinatario_rol as string | null) ?? null,
    });
  }
  const activa = (tipo: string) => reglas.get(tipo)?.activa ?? false;
  const umbral = (tipo: string, def: number) => reglas.get(tipo)?.umbral ?? def;

  const alertas: Alerta[] = [];

  if (activa('devolucion_vencida') || activa('devolucion_proxima')) {
    const pedidos = ((pedidosRes.data as Record<string, unknown>[]) ?? []).map((p) => ({
      id: String(p.id),
      fechaDevolucion: (p.fecha_devolucion as string | null) ?? null,
      estado: String(p.estado),
      sedeCod: (p.sede_cod as string | null) ?? null,
      cliente: (p.clientes as { nombre: string } | null)?.nombre ?? null,
    }));
    for (const a of alertasDevoluciones(pedidos, hoy, umbral('devolucion_proxima', 2))) {
      if (activa(a.tipo)) alertas.push(a);
    }
  }

  if (activa('stock_bajo')) {
    const materiales = ((materialesRes.data as Record<string, unknown>[]) ?? []).map((m) => ({
      id: String(m.id),
      nombre: String(m.nombre),
      stockActual: Number(m.stock_actual ?? 0),
      stockMinimo: Number(m.stock_minimo ?? 0),
      sedeCod: (m.sede_cod as string | null) ?? null,
      activo: Boolean(m.activo),
    }));
    alertas.push(...alertasStock(materiales));
  }

  if (activa('caja_sin_cerrar')) {
    const sesiones = ((cajaRes.data as Record<string, unknown>[]) ?? []).map((s) => ({
      id: String(s.id),
      sedeCod: String(s.sede_cod),
      fecha: String(s.fecha).slice(0, 10),
      estado: String(s.estado),
    }));
    alertas.push(...alertasCajaSinCerrar(sesiones, hoy));
  }

  if (activa('reporte_sin_evaluar')) {
    const reportes = ((reportesRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      sedeCod: String(r.sede_cod),
      fecha: String(r.fecha).slice(0, 10),
      evaluado: Boolean(r.evaluado),
      noEvaluable: Boolean(r.no_evaluable),
    }));
    alertas.push(...alertasReportesSinEvaluar(reportes, hoy, umbral('reporte_sin_evaluar', 2)));
  }

  if (alertas.length === 0) return 0;

  const rows = ordenarAlertas(alertas).map((a) => ({
    tipo: a.tipo,
    titulo: a.titulo,
    mensaje: a.mensaje,
    severidad: a.severidad,
    destinatario_rol: reglas.get(a.tipo)?.destinatarioRol ?? null,
    destinatario_sede: a.sede ?? null,
    ref_tipo: a.refTipo ?? null,
    ref_id: a.refId ?? null,
    dedup_key: `${a.tipo}:${a.refId ?? ''}`,
  }));

  // ignoreDuplicates: no re-alerta lo que ya existe (preserva `leida`).
  const { data, error } = await sb
    .from('notificaciones')
    .upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(error.message);
  return (data as unknown[])?.length ?? 0;
}
