import type { EstadoEnvio, TurnoReporte } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { diaPeruDe } from './fechas';
import { diasEntre, sumarDias, type PrendaAtraso } from './dashboard-semaforos';

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

export type AsistenciaHoy = { presentes: number; tardanzas: number; faltas: number; sinDato: number };

/** Asistencia de un día: la RLS de `asistencias` decide cuántas filas ve cada persona. */
export async function asistenciaDelDia(fecha: string): Promise<AsistenciaHoy> {
  const vacio = { presentes: 0, tardanzas: 0, faltas: 0, sinDato: 0 };
  try {
    const sb = getServerClient();
    const { data, error } = await sb
      .from('asistencias')
      .select('empleado_id, condicion, minutos_tardanza')
      .eq('fecha', fecha)
      .limit(500);
    if (error) return vacio;
    // Una persona puede tener dos turnos: se cuenta una vez, y la falta pesa más que lo demás.
    const porPersona = new Map<string, { falta: boolean; trabajo: boolean; tarde: boolean }>();
    for (const r of (data as { empleado_id: string; condicion: string | null; minutos_tardanza: number | null }[]) ?? []) {
      const p = porPersona.get(r.empleado_id) ?? { falta: false, trabajo: false, tarde: false };
      if (r.condicion === 'falta') p.falta = true;
      else if (r.condicion === 'trabajado') p.trabajo = true;
      if ((r.minutos_tardanza ?? 0) > 0) p.tarde = true;
      porPersona.set(r.empleado_id, p);
    }
    const out = { ...vacio };
    for (const p of porPersona.values()) {
      if (p.falta && !p.trabajo) out.faltas += 1;
      else if (p.trabajo) out.presentes += 1;
      else out.sinDato += 1;
      if (p.tarde) out.tardanzas += 1;
    }
    return out;
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
