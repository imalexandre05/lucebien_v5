// Mi desempeño (Fase 3): lo que ve CADA usuario de sí mismo — sus propios movimientos del mes
// (reportes como encargado, extras que registró, incidencias donde es responsable, puntos de
// pipeline) más su última evaluación mensual. Consultas explícitamente acotadas al propio id
// (independiente del alcance más amplio por sede que tiene la RLS de reportes/incidencias).
import { getServerClient } from './supabase/server';
import { VALORES, notaValores360, type ValorKey } from '@scilb/core';
import { getSesion } from './auth';

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
// Los extras no se pagan en soles (decisión del dueño, 05-oct-2026): lo que cuenta son sus puntos.
export type MiExtra = { id: string; fecha: string; nombre: string; puntosTotal: number };
export type MiIncidencia = { id: string; fecha: string; tipo: string; nivel: string };
// metodo/componentes/pesosUsados (0095, spec puntos-como-moneda §2 C-4/C-5): la pantalla necesita
// saber CON QUÉ sistema se leyó esta evaluación (banda si 'puntos', tramo si 'ponderado' — igual
// criterio que el historial de /evaluaciones) y el desglose para mostrar el perfil propio.
export type MiEvaluacion = {
  mes: string;
  // null = «en cálculo» (0119): evaluación `ponderado` cuyo Valores 360° aún no es público.
  notaFinal: number | null;
  metodo: 'ponderado' | 'puntos';
  componentes: Record<string, number> | null;
  pesosUsados: Record<string, number> | null;
  // true cuando la nota de Valores 360° de ESTA evaluación no se le muestra a quien mira lo suyo:
  // el mes no está cerrado o no alcanza el mínimo de evaluaciones (spec valores360-anonimato §6).
  // Cuando es true, `componentes` ya viene sin `valores` ni `valoresCantidad`.
  valoresOculto: boolean;
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

  // `evaluaciones_mensuales` sólo la lee directo el administrador (0119). Lo propio va por
  // `mi_evaluacion_mensual`; lo de otra persona sólo lo ve el administrador, por la tabla. Para nadie más
  // `evaluaciones_mensuales_visibles` devuelve filas ajenas (decisión del dueño, 06-oct-2026; spec
  // valores360-base §8.1): un encargado que abre a otra persona ve «sin evaluación». Las funciones
  // devuelven la fila sin `valores`/`valoresCantidad` y con `nota_final` en null mientras el mes no sea
  // público.
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  const esPropia = sesion?.usuario.id === empleadoId;
  const consultaEvaluacion = esPropia
    ? sb.rpc('mi_evaluacion_mensual').order('mes', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
    : esAdmin
      ? sb.from('evaluaciones_mensuales').select('*').eq('empleado_id', empleadoId).order('mes', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : sb.rpc('evaluaciones_mensuales_visibles').eq('empleado_id', empleadoId).order('mes', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const [repRes, extRes, incRes, pipeRes, evalRes] = await Promise.all([
    sb.from('reportes').select('id, fecha, turno, evaluado, puntaje_eval').eq('encargado_id', empleadoId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    sb.from('reporte_extras').select('id, nombre, puntos_total, reportes!inner(fecha)').eq('registrado_por_id', empleadoId).gte('reportes.fecha', desde).lte('reportes.fecha', hasta),
    sb.from('incidencias').select('id, fecha, tipo, nivel').eq('responsable_id', empleadoId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    // `pipeline_puntos.fecha` es la ÚNICA columna timestamptz de estas cinco consultas: va por día
    // natural de Perú (ver `inicioDiaPeru`). El resto filtra columnas `date` y no necesita nada.
    sb
      .from('pipeline_puntos')
      .select('puntos')
      .eq('empleado_id', empleadoId)
      .gte('fecha', inicioDiaPeru(desde))
      .lt('fecha', inicioDiaPeru(diaSiguiente(hasta))),
    consultaEvaluacion,
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
    puntosTotal: Number(e.puntos_total ?? 0),
  }));

  const incidencias: MiIncidencia[] = ((incRes.data as Record<string, unknown>[]) ?? []).map((i) => ({
    id: String(i.id),
    fecha: String(i.fecha ?? '').slice(0, 10),
    tipo: String(i.tipo ?? ''),
    nivel: String(i.nivel ?? ''),
  }));

  const puntosPipeline = ((pipeRes.data as { puntos: number }[]) ?? []).reduce((s, p) => s + Number(p.puntos ?? 0), 0);

  const evalRow = evalRes.data as Record<string, unknown> | null;

  // La nota de Valores 360° guardada en `componentes.valores` se calculó cuando el administrador
  // evaluó, tal vez EN VIVO y con menos votos que el mínimo: con uno solo, es el voto de una
  // persona. Quien mira lo SUYO no ve ese número guardado: ve el que devuelve `valores_mis_puntajes`
  // (0116) para el mes de la evaluación, que sólo existe si el mes está cerrado y con el mínimo. Si
  // no hay fila, o la función es anterior a 0116 o falla, se oculta: ante la duda, no se muestra. Un
  // administrador mirando a OTRA persona ve todo (esa lectura la autoriza la RLS). El valor guardado
  // no se toca: el pago sigue leyéndolo igual.
  let valoresOculto = false;
  let componentes = (evalRow?.componentes as Record<string, number> | null) ?? null;
  if (evalRow && !esPropia && !esAdmin) {
    // Encargado con `datos_personas` mirando a otra persona: la función ya quitó `valores`.
    valoresOculto = evalRow.valores_publicos !== true;
  }
  if (evalRow && esPropia) {
    const { data: vp, error: vpError } = await sb.rpc('valores_mis_puntajes', { p_mes: String(evalRow.mes ?? '') });
    const fila = vpError ? undefined : ((vp as Record<string, number | string>[] | null) ?? [])[0];
    valoresOculto = !fila || fila.cantidad == null;
    if (componentes) {
      const { valores: _v, valoresCantidad: _c, ...resto } = componentes;
      componentes = resto;
      if (fila && !valoresOculto) {
        const promedios: Partial<Record<ValorKey, number>> = {};
        for (const { key } of VALORES) promedios[key] = Number(fila[key]);
        const nota = notaValores360(promedios);
        if (nota != null) componentes = { ...componentes, valores: nota, valoresCantidad: Number(fila.cantidad) };
      }
    }
  }

  const ultimaEvaluacion: MiEvaluacion = evalRow
    ? {
        mes: String(evalRow.mes ?? ''),
        notaFinal: evalRow.nota_final == null ? null : Number(evalRow.nota_final),
        // undefined (0095 sin aplicar) cae en 'ponderado', igual que el default de la columna en
        // la base — una fila vieja sin `metodo` ES una evaluación 'ponderado'.
        metodo: (evalRow.metodo as 'ponderado' | 'puntos' | undefined) ?? 'ponderado',
        componentes,
        pesosUsados: (evalRow.pesos_usados as Record<string, number> | null) ?? null,
        valoresOculto,
      }
    : null;

  return { reportes, extras, incidencias, puntosPipeline: Math.round(puntosPipeline * 100) / 100, ultimaEvaluacion };
}
