'use server';

import { revalidatePath } from 'next/cache';
import type { TurnoReporte } from '@scilb/core';
import {
  listarActividadesConfig,
  listarExtrasCatalogo,
  listarLayoutZonas,
  getDraft,
  saveDraft,
  crearReporte,
  encargadoDeReporte,
  evaluarReporte,
  anularReporte,
  anularEval,
  marcarAsistenciaReporte,
  buscarReporteId,
  buscarConflictoTurno,
  buscarReportePendienteSede,
  ReporteCrearError,
  type ActividadDelTurno,
  type ExtraCatalogo,
  type LayoutZona,
  type ConflictoTurno,
  type YaEnviado,
  type ReportePendiente,
} from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { operadorParaAccion } from '../../lib/pipeline-operador';
import { crearIncidenciasDeReporte, leerResponsableIncidencia, listarTiposIncidencia } from '../../lib/incidencias-repo';
import { resolverIncidencia, responsableValido } from '../../lib/incidencias-catalogo';

// Inicia el espacio de trabajo de un turno: catálogo de actividades + zonas de limpieza + draft.
// `yaEnviado` = reporte si el turno ya se envió (para pasar a Evaluación, como el viejo).
// `pendienteAnterior` (Fase 4 tarea 2): el reporte previo de la sede que aún no se evaluó — solo
// advisory (el RPC reportes_crear vuelve a validarlo server-side), pero deja avisar ANTES de que
// el usuario llene todo el formulario.
export async function iniciarTurno(
  sede: string,
  fecha: string,
  turno: TurnoReporte,
): Promise<{
  actividades: ActividadDelTurno[];
  zonas: LayoutZona[];
  extrasCatalogo: ExtraCatalogo[];
  draft: Record<string, unknown> | null;
  yaEnviado: YaEnviado;
  conflicto: ConflictoTurno;
  pendienteAnterior: ReportePendiente;
}> {
  const [actividades, zonas, extrasCatalogo, draft, yaEnviado, conflicto, pendienteAnterior] = await Promise.all([
    listarActividadesConfig(sede, fecha, turno),
    listarLayoutZonas(sede),
    listarExtrasCatalogo(sede),
    getDraft(sede, fecha, turno),
    buscarReporteId(sede, fecha, turno),
    buscarConflictoTurno(sede, fecha, turno),
    buscarReportePendienteSede(sede),
  ]);
  return { actividades, zonas, extrasCatalogo, draft: draft?.payload ?? null, yaEnviado, conflicto, pendienteAnterior };
}

// Tipos locales (no exportados): un archivo 'use server' solo puede EXPORTAR funciones async.
type IncidenciaReporte = {
  tipo: string;
  nivel: string;
  descripcion: string;
  responsableId: string | null;
  puntosPenalidad: number;
};

type CrearReporteInput = {
  id: string;
  sede: string;
  fecha: string;
  turno: string;
  encargado: string | null;
  actTotal: number;
  actDone: number;
  trabajadores: string[];
  actividades: { cod: string; nombre: string; cat: string | null; peso: number; obs: string }[];
  extras: { cod: string | null; tipo: string; nombre: string; cantidad: number; detalle: string; registrado_por_id: string | null }[];
  incidencias: IncidenciaReporte[];
};

export async function accionCrearReporte(
  input: CrearReporteInput,
  operador?: string,
): Promise<{ ok: boolean; id?: string; error?: string; bloqueoId?: string }> {
  try {
    // Equipo compartido: sin código del encargado no se envía (la base lo vuelve a exigir, 0146).
    // Con código, el encargado es quien lo ingresó: si el formulario trae otro, la RPC lo rechaza.
    const token = await operadorParaAccion(operador);
    // C-2 (spec 2026-08-25-incidencias-alcance-y-formulario-design.md §3): la descripción es
    // obligatoria sólo para incidencias del tipo de categoría 'Otros'. El formulario ya lo hace
    // cumplir; esto es lo que de verdad lo exige — un cliente puede saltearse una validación de
    // UI. Se comprueba ANTES de crear el reporte: si falta, no debe quedar nada a medio guardar.
    // Nivel y puntos de cada incidencia salen del catálogo, no del navegador (spec
    // 2026-10-18-incidencias-servidor-valida). Se resuelve acá, antes de crear el reporte.
    let incidenciasResueltas = input.incidencias;
    if (input.incidencias.length) {
      const tiposCatalogo = await listarTiposIncidencia();
      const resueltas = [];
      for (const i of input.incidencias) {
        const r = resolverIncidencia(tiposCatalogo, i.tipo, i.nivel);
        if (!r.ok) return { ok: false, error: `${r.error} («${i.tipo}»)` };
        if (i.responsableId) {
          const r = await leerResponsableIncidencia(i.responsableId);
          if (!r || !responsableValido(r, input.sede)) {
            return { ok: false, error: `El responsable de la incidencia «${i.tipo}» debe ser una persona activa de esta sede.` };
          }
        }
        resueltas.push({ ...i, nivel: r.nivel, puntosPenalidad: r.puntosPenalidad });
      }
      incidenciasResueltas = resueltas;
      const faltante = input.incidencias.find((i) => {
        const t = tiposCatalogo.find((x) => x.tipo === i.tipo);
        return t?.categoria === 'Otros' && !i.descripcion.trim();
      });
      if (faltante) {
        return { ok: false, error: `Falta la descripción de la incidencia "${faltante.tipo}": este tipo la requiere.` };
      }
    }
    const id = await crearReporte(input, token);
    // Incidencias del turno → registradas ligadas al reporte (origen='reporte').
    if (input.incidencias.length) {
      const sesion = await getSesion();
      await crearIncidenciasDeReporte({
        sede: input.sede,
        fecha: input.fecha,
        reporteId: id,
        // Con código de operador, las incidencias las reporta el encargado que lo ingresó.
        reportadoPorId: (token ? await encargadoDeReporte(id) : null) ?? sesion?.usuario.id ?? null,
        items: incidenciasResueltas,
      });
    }
    // Auto-asistencia (best-effort): no debe romper la creación del reporte si falla.
    try {
      await marcarAsistenciaReporte(id);
    } catch {
      /* ignore */
    }
    revalidatePath('/reportes');
    revalidatePath('/administracion/reportes');
    revalidatePath('/incidencias');
    revalidatePath('/asistencias');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ReporteCrearError) {
      return { ok: false, error: e.message, bloqueoId: e.bloqueoId };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el reporte' };
  }
}

// Autosave del formulario (best-effort; no rompe la UI si falla).
export async function accionGuardarDraft(p: {
  sede: string;
  fecha: string;
  turno: string;
  encargadoId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await saveDraft(p);
  } catch {
    // silencioso: el autosave no debe interrumpir al usuario
  }
}

export async function accionEvaluar(
  id: string,
  calificaciones: { cod: string; cal: number; obs: string }[],
): Promise<{ ok: boolean; puntaje?: number; error?: string }> {
  try {
    const puntaje = await evaluarReporte(id, calificaciones);
    revalidatePath(`/reportes/${id}`);
    revalidatePath('/reportes');
    revalidatePath('/administracion/reportes');
    return { ok: true, puntaje };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al evaluar' };
  }
}

export async function accionAnular(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await anularReporte(id);
    revalidatePath('/reportes');
    revalidatePath('/administracion/reportes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al anular' };
  }
}

export async function accionAnularEval(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await anularEval(id);
    revalidatePath(`/reportes/${id}`);
    revalidatePath('/reportes');
    revalidatePath('/administracion/reportes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al anular la evaluación' };
  }
}
