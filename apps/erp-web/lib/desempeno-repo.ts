// Mi desempeño (Fase 3): lo que ve CADA usuario de sí mismo — sus propios movimientos del mes
// (reportes como encargado, extras que registró, incidencias donde es responsable, puntos de
// pipeline) más su última evaluación mensual. Consultas explícitamente acotadas al propio id
// (independiente del alcance más amplio por sede que tiene la RLS de reportes/incidencias).
import { getServerClient } from './supabase/server';

/**
 * El instante en que empieza un día natural de Perú (UTC−5), para filtrar una columna
 * `timestamptz`.
 *
 * POR QUÉ. `pipeline_puntos.fecha` es timestamptz y el servidor corre en UTC (no-negociable 4).
 * Comparar contra 'YYYY-MM-DD' pelado lo interpreta como medianoche UTC, que en hora Perú son las
 * 19:00 del día ANTERIOR: el rango queda corrido cinco horas y el último día se pierde casi
 * entero. Medido contra la base el 23-ago-2026: los puntos de junio de una misma persona daban
 * 38,50 con el filtro viejo y 70,50 con éste — acá eso es el número que alguien ve de SÍ MISMO.
 *
 * Copia deliberada de lib/colaboradores-repo.ts: son las dos únicas consultas de la aplicación que
 * filtran esta columna, y este módulo no debe depender del otro. Desde la 0110 la RPC de evaluación (`private.evaluacion_componentes_datos`) usa el mismo criterio
 * (día de Perú).
 */
const inicioDiaPeru = (dia: string): string => `${dia}T00:00:00-05:00`;

/** El día siguiente a 'YYYY-MM-DD'. Aritmética en UTC para que la zona del proceso no la corra. */
const diaSiguiente = (dia: string): string =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export type MiReporte = { id: string; fecha: string; turno: string; evaluado: boolean; puntajeEval: number | null };
export type MiExtra = { id: string; fecha: string; nombre: string; montoTotal: number };
export type MiIncidencia = { id: string; fecha: string; tipo: string; nivel: string };
// metodo/componentes/pesosUsados (0095, spec puntos-como-moneda §2 C-4/C-5): la pantalla necesita
// saber CON QUÉ sistema se leyó esta evaluación (banda si 'puntos', tramo si 'ponderado' — igual
// criterio que el historial de /evaluaciones) y el desglose para mostrar el perfil propio.
export type MiEvaluacion = {
  mes: string;
  notaFinal: number;
  metodo: 'ponderado' | 'puntos';
  componentes: Record<string, number> | null;
  pesosUsados: Record<string, number> | null;
} | null;

export type MiDesempeno = {
  reportes: MiReporte[];
  extras: MiExtra[];
  incidencias: MiIncidencia[];
  puntosPipeline: number;
  ultimaEvaluacion: MiEvaluacion;
};

export async function miDesempeno(empleadoId: string, desde: string, hasta: string): Promise<MiDesempeno> {
  const sb = getServerClient();

  const [repRes, extRes, incRes, pipeRes, evalRes] = await Promise.all([
    sb.from('reportes').select('id, fecha, turno, evaluado, puntaje_eval').eq('encargado_id', empleadoId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    sb.from('reporte_extras').select('id, nombre, monto_total, reportes!inner(fecha)').eq('registrado_por_id', empleadoId).gte('reportes.fecha', desde).lte('reportes.fecha', hasta),
    sb.from('incidencias').select('id, fecha, tipo, nivel').eq('responsable_id', empleadoId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    // `pipeline_puntos.fecha` es la ÚNICA columna timestamptz de estas cinco consultas: va por día
    // natural de Perú (ver `inicioDiaPeru`). El resto filtra columnas `date` y no necesita nada.
    sb
      .from('pipeline_puntos')
      .select('puntos')
      .eq('empleado_id', empleadoId)
      .gte('fecha', inicioDiaPeru(desde))
      .lt('fecha', inicioDiaPeru(diaSiguiente(hasta))),
    // select('*') a propósito (mismo criterio que el resto de esta función, y que evaluaciones-
    // repo.ts): si la 0095 todavía no corrió, faltan metodo/componentes/pesos_usados y esto sigue
    // devolviendo lo que ya devolvía antes, no un 500.
    sb.from('evaluaciones_mensuales').select('*').eq('empleado_id', empleadoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [repRes, extRes, incRes, pipeRes, evalRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const reportes: MiReporte[] = ((repRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    fecha: String(r.fecha ?? '').slice(0, 10),
    turno: String(r.turno ?? ''),
    evaluado: Boolean(r.evaluado),
    puntajeEval: r.puntaje_eval == null ? null : Number(r.puntaje_eval),
  }));

  const extras: MiExtra[] = ((extRes.data as Record<string, unknown>[]) ?? []).map((e) => ({
    id: String(e.id),
    fecha: String((e.reportes as { fecha: string } | null)?.fecha ?? '').slice(0, 10),
    nombre: String(e.nombre ?? ''),
    montoTotal: Number(e.monto_total ?? 0),
  }));

  const incidencias: MiIncidencia[] = ((incRes.data as Record<string, unknown>[]) ?? []).map((i) => ({
    id: String(i.id),
    fecha: String(i.fecha ?? '').slice(0, 10),
    tipo: String(i.tipo ?? ''),
    nivel: String(i.nivel ?? ''),
  }));

  const puntosPipeline = ((pipeRes.data as { puntos: number }[]) ?? []).reduce((s, p) => s + Number(p.puntos ?? 0), 0);

  const evalRow = evalRes.data as Record<string, unknown> | null;
  const ultimaEvaluacion: MiEvaluacion = evalRow
    ? {
        mes: String(evalRow.mes ?? ''),
        notaFinal: Number(evalRow.nota_final ?? 0),
        // undefined (0095 sin aplicar) cae en 'ponderado', igual que el default de la columna en
        // la base — una fila vieja sin `metodo` ES una evaluación 'ponderado'.
        metodo: (evalRow.metodo as 'ponderado' | 'puntos' | undefined) ?? 'ponderado',
        componentes: (evalRow.componentes as Record<string, number> | null) ?? null,
        pesosUsados: (evalRow.pesos_usados as Record<string, number> | null) ?? null,
      }
    : null;

  return { reportes, extras, incidencias, puntosPipeline: Math.round(puntosPipeline * 100) / 100, ultimaEvaluacion };
}
