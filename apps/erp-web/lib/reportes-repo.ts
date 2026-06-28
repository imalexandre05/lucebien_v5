import type { Reporte, ReporteActividad, ReporteDetalle, ReporteExtra, TurnoReporte } from '@scilb/core';
import { getServerClient } from './supabase/server';

type RepRow = {
  id: string;
  sede_cod: string;
  turno: string;
  fecha: string;
  encargado_id: string | null;
  evaluador_id: string | null;
  puntaje: number | null;
  puntaje_eval: number | null;
  act_total: number | null;
  act_done: number | null;
  evaluado: boolean;
  bloqueado: boolean;
  no_evaluable: boolean | null;
  auto_enviado: boolean | null;
  created_at: string;
};

// Mapa id→nombre de empleados. OJO RLS: un no-admin solo se ve a sí mismo (policy emp_select
// de 0002), así que para él los nombres de terceros saldrán null hasta que exista una policy
// de "directorio" en empleados. Para admin/dueño resuelve todos.
async function nombresEmpleados(
  sb: ReturnType<typeof getServerClient>,
): Promise<(id: string | null) => string | null> {
  const { data, error } = await sb.from('empleados').select('id, nombre');
  if (error) throw new Error(error.message);
  const map = new Map((data as { id: string; nombre: string }[]).map((e) => [e.id, e.nombre]));
  return (id) => (id ? map.get(id) ?? null : null);
}

function baseReporte(r: RepRow, nombre: (id: string | null) => string | null, trabajadores: string[]): Reporte {
  return {
    id: r.id,
    sedeCod: r.sede_cod,
    turno: (r.turno as TurnoReporte) ?? 'M',
    fecha: (r.fecha ?? '').slice(0, 10),
    encargadoId: r.encargado_id,
    encargadoNombre: nombre(r.encargado_id),
    evaluadorId: r.evaluador_id,
    evaluadorNombre: nombre(r.evaluador_id),
    puntaje: Number(r.puntaje ?? 0),
    puntajeEval: r.puntaje_eval == null ? null : Number(r.puntaje_eval),
    actTotal: Number(r.act_total ?? 0),
    actDone: Number(r.act_done ?? 0),
    evaluado: Boolean(r.evaluado),
    bloqueado: Boolean(r.bloqueado),
    noEvaluable: Boolean(r.no_evaluable),
    autoEnviado: Boolean(r.auto_enviado),
    trabajadores,
    createdAt: r.created_at,
  };
}

// Lista los reportes (más recientes primero), con sus trabajadores resueltos. Tope 100 como el viejo.
export async function listarReportes(): Promise<Reporte[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reportes')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data as RepRow[]) ?? [];
  const nombre = await nombresEmpleados(sb);

  const trabByRep = new Map<string, string[]>();
  if (rows.length) {
    const { data: tr, error: e2 } = await sb
      .from('reporte_trabajadores')
      .select('reporte_id, empleado_id')
      .in('reporte_id', rows.map((r) => r.id));
    if (e2) throw new Error(e2.message);
    for (const t of (tr as { reporte_id: string; empleado_id: string | null }[]) ?? []) {
      const n = nombre(t.empleado_id);
      if (!n) continue;
      const arr = trabByRep.get(t.reporte_id) ?? [];
      arr.push(n);
      trabByRep.set(t.reporte_id, arr);
    }
  }

  return rows.map((r) => baseReporte(r, nombre, trabByRep.get(r.id) ?? []));
}

// Detalle completo: reporte + actividades + extras + trabajadores.
export async function obtenerReporte(id: string): Promise<ReporteDetalle | null> {
  const sb = getServerClient();
  const { data, error } = await sb.from('reportes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as RepRow;
  const nombre = await nombresEmpleados(sb);

  const [trabRes, actRes, extRes] = await Promise.all([
    sb.from('reporte_trabajadores').select('empleado_id').eq('reporte_id', id),
    sb.from('reporte_actividades').select('*').eq('reporte_id', id).order('cod', { ascending: true }),
    sb.from('reporte_extras').select('*').eq('reporte_id', id),
  ]);
  for (const res of [trabRes, actRes, extRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const trabajadores = ((trabRes.data as { empleado_id: string | null }[]) ?? [])
    .map((t) => nombre(t.empleado_id))
    .filter((x): x is string => Boolean(x));

  const actividades: ReporteActividad[] = ((actRes.data as Record<string, unknown>[]) ?? []).map((a) => ({
    id: String(a.id),
    cod: String(a.cod),
    nombre: String(a.nombre),
    cat: (a.cat as string | null) ?? null,
    peso: Number(a.peso ?? 0),
    realizada: Boolean(a.realizada),
    calificacion: a.calificacion == null ? null : Number(a.calificacion),
    obs: (a.obs as string | null) ?? null,
    obsEval: (a.obs_eval as string | null) ?? null,
  }));

  const extras: ReporteExtra[] = ((extRes.data as Record<string, unknown>[]) ?? []).map((e) => ({
    id: String(e.id),
    tipo: String(e.tipo),
    nombre: String(e.nombre),
    cantidad: Number(e.cantidad ?? 1),
    montoTotal: Number(e.monto_total ?? 0),
    precioUnitario: Number(e.precio_unitario ?? 0),
    detalle: (e.detalle as string | null) ?? null,
    registradoPorId: (e.registrado_por_id as string | null) ?? null,
    registradoPorNombre: nombre((e.registrado_por_id as string | null) ?? null),
  }));

  return { ...baseReporte(r, nombre, trabajadores), actividades, extras };
}
