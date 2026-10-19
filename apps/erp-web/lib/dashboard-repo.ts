import type { EstadoEnvio, TurnoReporte } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { diaPeruDe } from './fechas';
import { diasEntre, sumarDias, resumenAsistencia, type AsistenciaPersona, type ResumenAsistencia, type PrendaAtraso } from './dashboard-semaforos';

// Consultas AGREGADAS del dashboard (sesión 8B): cada una trae sólo las columnas que el panel
// dibuja, acotadas por fecha o por estado. Nada de tablas completas. La RLS decide qué filas ve
// cada persona; `sedes` sólo reduce más para quien no es administrador.
//
// Cada función falla en silencio hacia un valor vacío: una tarjeta rota no debe tumbar el panel.

type Alcance = { sedes: string[] | null }; // null = todas (administrador)

const sedeQ = <T extends { in: (c: string, v: string[]) => T }>(q: T, a: Alcance, col = 'sede_cod'): T =>
  a.sedes ? q.in(col, a.sedes) : q;

/** Prendas que siguen en el taller, con los días que llevan sin moverse. */
export async function prendasEnProceso(hoy: string): Promise<PrendaAtraso[]> {
  try {
    const sb = getServerClient();
    const { data, error } = await sb
      .from('prenda_pasada')
      .select('etapa, fecha_ingreso, fecha_actualizado')
      .not('etapa', 'in', '(enviado,recibido,dividido)')
      .eq('dividida', false);
    if (error) return [];
    return ((data as { etapa: string; fecha_ingreso: string | null; fecha_actualizado: string | null }[]) ?? []).map((r) => {
      const ref = r.fecha_actualizado ?? r.fecha_ingreso;
      return { etapa: r.etapa, dias: ref ? Math.max(0, diasEntre(diaPeruDe(ref), hoy)) : 0 };
    });
  } catch {
    return [];
  }
}

export type ReporteResumen = { sedeCod: string; fecha: string; turno: TurnoReporte; evaluado: boolean; noEvaluable: boolean; estadoEnvio: EstadoEnvio };

/** Reportes de los últimos días (para la cobertura de hoy y la tendencia). */
export async function reportesDesde(desde: string, a: Alcance): Promise<ReporteResumen[]> {
  try {
    const sb = getServerClient();
    const q = sb.from('reportes').select('sede_cod, fecha, turno, evaluado, no_evaluable, auto_enviado, estado_envio').gte('fecha', desde).limit(1000);
    const { data, error } = await sedeQ(q, a);
    if (error) return [];
    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      sedeCod: String(r.sede_cod),
      fecha: String(r.fecha ?? '').slice(0, 10),
      turno: (r.turno as TurnoReporte) ?? 'M',
      evaluado: Boolean(r.evaluado),
      noEvaluable: Boolean(r.no_evaluable),
      // Mismo cálculo que derivarEstadoEnvio() de reportes-repo.ts.
      estadoEnvio: (r.estado_envio as EstadoEnvio | null) ?? (!r.auto_enviado ? 'enviado' : r.no_evaluable ? 'sin_actividad' : 'no_enviado'),
    }));
  } catch {
    return [];
  }
}

/** Todos los reportes que nadie ha evaluado (sin importar la fecha), por sede. */
export async function reportesPorEvaluarPorSede(a: Alcance): Promise<Record<string, number>> {
  try {
    const sb = getServerClient();
    const q = sb.from('reportes').select('sede_cod').eq('evaluado', false).eq('no_evaluable', false).limit(1000);
    const { data, error } = await sedeQ(q, a);
    if (error) return {};
    const out: Record<string, number> = {};
    for (const r of (data as { sede_cod: string }[]) ?? []) out[r.sede_cod] = (out[r.sede_cod] ?? 0) + 1;
    return out;
  } catch {
    return {};
  }
}

export type IncidenciaResumen = { sedeCod: string; fecha: string; tipo: string };

export async function incidenciasDesde(desde: string, a: Alcance): Promise<IncidenciaResumen[]> {
  try {
    const sb = getServerClient();
    const q = sb.from('incidencias').select('sede_cod, fecha, tipo').gte('fecha', desde).limit(1000);
    const { data, error } = await sedeQ(q, a);
    if (error) return [];
    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      sedeCod: String(r.sede_cod),
      fecha: String(r.fecha ?? '').slice(0, 10),
      tipo: String(r.tipo ?? ''),
    }));
  } catch {
    return [];
  }
}

/**
 * Quiénes debían venir hoy: contratos vigentes con un turno ese día que ya empezó. Sólo el
 * administrador lee los acuerdos de todos (RLS); para el resto devuelve null y el panel cuenta
 * únicamente lo registrado.
 */
async function esperadosDeHoy(dia: number, hoy: string, horaActual: string): Promise<Set<string> | null> {
  try {
    const sb = getServerClient();
    const [ac, inact] = await Promise.all([
      sb
        .from('sueldo_acuerdos')
        .select('empleado_id, sueldo_acuerdo_turnos(dia_semana, hora_inicio)')
        .eq('estado', 'vigente')
        .lte('fecha_inicio', hoy)
        .gte('fecha_fin', hoy)
        .limit(200),
      sb.from('empleados').select('id').eq('activo', false).limit(200),
    ]);
    if (ac.error || !ac.data?.length) return null;
    const baja = new Set(((inact.data as { id: string }[]) ?? []).map((r) => r.id));
    const out = new Set<string>();
    for (const r of ac.data as unknown as { empleado_id: string; sueldo_acuerdo_turnos: { dia_semana: number; hora_inicio: string }[] | null }[]) {
      if (baja.has(r.empleado_id)) continue;
      if ((r.sueldo_acuerdo_turnos ?? []).some((t) => t.dia_semana === dia && String(t.hora_inicio).slice(0, 5) <= horaActual)) {
        out.add(r.empleado_id);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** Asistencia de un día: la RLS de `asistencias` decide cuántas filas ve cada persona. */
export async function asistenciaDelDia(fecha: string, dia: number, horaActual: string): Promise<ResumenAsistencia> {
  const vacio = resumenAsistencia(new Map(), null);
  try {
    const sb = getServerClient();
    const [{ data, error }, esperados] = await Promise.all([
      sb.from('asistencias').select('empleado_id, condicion, minutos_tardanza').eq('fecha', fecha).limit(500),
      esperadosDeHoy(dia, fecha, horaActual),
    ]);
    if (error) return vacio;
    // Una persona puede tener dos turnos: se cuenta una vez.
    const porPersona = new Map<string, AsistenciaPersona>();
    for (const r of (data as { empleado_id: string; condicion: string | null; minutos_tardanza: number | null }[]) ?? []) {
      const p = porPersona.get(r.empleado_id) ?? { falta: false, trabajo: false, tarde: false };
      if (r.condicion === 'falta') p.falta = true;
      else if (r.condicion === 'trabajado') p.trabajo = true;
      if ((r.minutos_tardanza ?? 0) > 0) p.tarde = true;
      porPersona.set(r.empleado_id, p);
    }
    return resumenAsistencia(porPersona, esperados);
  } catch {
    return vacio;
  }
}

export type PagosPorCerrar = { porCerrar: number; vencidos: number; proximos: number };

/**
 * Liquidaciones en borrador cuyo período termina en la semana (o ya terminó). Sólo CUENTA: no lee
 * montos. La RLS de `sueldo_liquidaciones` deja ver todas sólo al administrador. Devuelve null si
 * no se pudo leer.
 */
export async function pagosPorCerrar(hoy: string): Promise<PagosPorCerrar | null> {
  try {
    const sb = getServerClient();
    const { data, error } = await sb
      .from('sueldo_liquidaciones')
      .select('periodo_hasta')
      .eq('estado', 'borrador')
      .lte('periodo_hasta', sumarDias(hoy, 7))
      .limit(500);
    if (error) return null;
    const hastas = ((data as { periodo_hasta: string }[]) ?? []).map((r) => String(r.periodo_hasta).slice(0, 10));
    const vencidos = hastas.filter((h) => h < hoy).length;
    return { porCerrar: hastas.length, vencidos, proximos: hastas.length - vencidos };
  } catch {
    return null;
  }
}

export type MetasSemana = { cumplidas: number; noCumplidas: number; sinDato: number };

/** Metas de «Ventas y metas» de las semanas que empezaron en los últimos 14 días. Sólo admin ve filas. */
export async function metasRecientes(desde: string): Promise<MetasSemana | null> {
  try {
    const sb = getServerClient();
    const { data, error } = await sb.from('sueldo_ventas_semana').select('meta_cumplida').gte('desde', desde).limit(500);
    if (error) return null;
    const out = { cumplidas: 0, noCumplidas: 0, sinDato: 0 };
    for (const r of (data as { meta_cumplida: boolean | null }[]) ?? []) {
      if (r.meta_cumplida === true) out.cumplidas += 1;
      else if (r.meta_cumplida === false) out.noCumplidas += 1;
      else out.sinDato += 1;
    }
    return out;
  } catch {
    return null;
  }
}

export type Evento = { kind: 'reporte' | 'incidencia' | 'pipeline'; ts: string; titulo: string; detalle: string | null; href: string };

/** Los últimos movimientos de las tres fuentes: 6 de cada una (con `limit` en la consulta). */
export async function actividadReciente(a: Alcance): Promise<Evento[]> {
  const sb = getServerClient();
  const [rep, inc, mov] = await Promise.all([
    sedeQ(sb.from('reportes').select('id, sede_cod, turno, created_at').order('created_at', { ascending: false }).limit(6), a),
    sedeQ(sb.from('incidencias').select('sede_cod, tipo, descripcion, created_at').order('created_at', { ascending: false }).limit(6), a),
    sb.from('prenda_historial').select('fecha, etapa_nueva, prenda_pasada(codigo, tipo)').order('fecha', { ascending: false }).limit(6),
  ]);
  const out: Evento[] = [];
  for (const r of (rep.data as { id: string; sede_cod: string; turno: string; created_at: string }[]) ?? []) {
    out.push({ kind: 'reporte', ts: r.created_at, titulo: `Reporte de turno · ${r.sede_cod} · ${r.turno}`, detalle: null, href: `/reportes/${r.id}` });
  }
  for (const r of (inc.data as { sede_cod: string; tipo: string; descripcion: string | null; created_at: string }[]) ?? []) {
    out.push({ kind: 'incidencia', ts: r.created_at, titulo: `${r.tipo} · ${r.sede_cod}`, detalle: r.descripcion, href: '/incidencias' });
  }
  type M = { fecha: string; etapa_nueva: string; prenda_pasada: { codigo: string; tipo: string | null } | { codigo: string; tipo: string | null }[] | null };
  for (const r of (mov.data as unknown as M[]) ?? []) {
    const pp = Array.isArray(r.prenda_pasada) ? r.prenda_pasada[0] : r.prenda_pasada;
    out.push({ kind: 'pipeline', ts: r.fecha, titulo: `${pp?.codigo ?? 'Prenda'} → ${r.etapa_nueva}`, detalle: pp?.tipo ?? null, href: '/pipeline' });
  }
  return out.filter((e) => e.ts).sort((x, y) => y.ts.localeCompare(x.ts)).slice(0, 7);
}
