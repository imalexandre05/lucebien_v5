// Módulo de colaboradores: el estado de una persona —o de todas— en un período.
//
// POR QUÉ EXISTE ESTE REPO. Lo que hacía falta no era una consulta nueva sino un GRANO nuevo. El
// ERP tenía una pantalla por tabla —evaluaciones, pagos, asistencias, valores, contratos— y ninguna
// por persona, que es como piensa quien administra: "¿qué pasa con Mary este mes?". Cada repo sigue
// siendo el dueño de su tabla; éste sólo los cruza por (empleado, período).
//
// AISLAMIENTO (no-negociable 3). Todo pasa por getServerClient(), así que manda la RLS. Ninguna
// consulta de acá usa getAdminClient(). Las pantallas del módulo comprueban además el permiso de
// cada sección antes de llamar: unificar la navegación no puede ampliar lo que alguien ve.

import { getServerClient } from './supabase/server';
import type { Periodo } from './periodo';
import { estadoVacio, type EstadoPeriodo } from './colaboradores-pasos';
import { listarPagosDeLiquidaciones, LiquidacionPagosNoMigradoError } from './sueldos-repo';

export type { EstadoPeriodo } from './colaboradores-pasos';

export type Colaborador = {
  id: string;
  nombre: string;
  iniciales: string | null;
  rol: string;
  rolCod: string | null;
  sedeCod: string | null;
  fechaIngreso: string | null;
  salarioBase: number;
  /** `false` cuando la persona está suspendida. Ver `listarColaboradores`. */
  activo: boolean;
};

const COLUMNAS_COLABORADOR =
  'id, nombre, iniciales, rol, rol_cod, sede_cod, fecha_ingreso, salario_base, activo';

const aColaborador = (r: Record<string, unknown>): Colaborador => ({
  id: String(r.id),
  nombre: String(r.nombre ?? ''),
  iniciales: (r.iniciales as string | null) ?? null,
  rol: String(r.rol ?? ''),
  rolCod: (r.rol_cod as string | null) ?? null,
  sedeCod: (r.sede_cod as string | null) ?? null,
  fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
  salarioBase: Number(r.salario_base ?? 0),
  activo: r.activo !== false,
});

/**
 * Las personas para el selector y la lista. Consulta liviana a propósito.
 *
 * POR QUÉ EXISTE `incluirSuspendidos`. Suspender era una puerta de una sola dirección. El botón
 * Reactivar vive en la pestaña Datos y el formulario de abono en la pestaña Liquidación y pago,
 * las dos DENTRO del expediente, y al expediente sólo se llega desde esta lista — /empleados es un
 * redirect a /personal. Con la lista recortada a `activo = true`, quien suspendía a alguien perdía
 * el camino para reactivarlo y para terminar de pagarle lo que le quedaba debiendo.
 *
 * NO AMPLÍA LO QUE NADIE VE (no-negociable 3): sigue mandando la RLS de `emp_select`. Esto cambia
 * qué pide la lista, no qué deja ver la base. Quién lo pide lo decide quien llama (hoy sólo
 * admin/dueño, ver app/personal/page.tsx).
 */
export async function listarColaboradores(incluirSuspendidos = false): Promise<Colaborador[]> {
  const sb = getServerClient();
  let consulta = sb.from('empleados').select(COLUMNAS_COLABORADOR);
  if (!incluirSuspendidos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta.order('nombre', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(aColaborador);
}

export async function obtenerColaborador(id: string): Promise<Colaborador | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleados')
    .select(COLUMNAS_COLABORADOR)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return aColaborador(data as Record<string, unknown>);
}

type Fila = Record<string, unknown>;

// ── Fechas: los dos criterios que usa el resto del archivo, juntos ───────────────────────

/**
 * El instante en que empieza un día natural de Perú (UTC−5), para filtrar una columna
 * `timestamptz`.
 *
 * POR QUÉ. `pipeline_puntos.fecha` es timestamptz y el servidor corre en UTC (no-negociable 4).
 * Comparar contra 'YYYY-MM-DD' pelado lo interpreta como medianoche UTC, que en hora Perú son las
 * 19:00 del día ANTERIOR: el rango entero queda corrido cinco horas y el último día del período se
 * pierde casi completo. Medido contra la base el 23-ago-2026: los puntos de junio de una misma
 * persona daban 38,50 con el filtro viejo y 70,50 con éste.
 *
 * Se cierra con `lt` sobre el día siguiente y no con `lte` sobre el último día, porque `hasta`
 * tiene que entrar ENTERO, hasta las 23:59:59 de Perú.
 *
 * Duplicado a propósito en lib/desempeno-repo.ts: son las dos únicas consultas de la aplicación
 * que filtran esta columna. La RPC de la 0057 tiene su propio filtro y otro criterio: no se toca.
 */
export const inicioDiaPeru = (dia: string): string => `${dia}T00:00:00-05:00`;

/** El día siguiente a 'YYYY-MM-DD'. Aritmética en UTC para que la zona del proceso no la corra. */
export const diaSiguiente = (dia: string): string =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Los días 'YYYY-MM-DD' de un rango cerrado, en orden. Aritmética en UTC por el mismo motivo.
 *
 * El tope de 400 vueltas es un cinturón, no una regla: un contrato mal cargado con `fecha_fin` en
 * 2099 no puede colgar la pantalla. Ningún período que ofrece la barra llega a un año.
 */
function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return dias;
  for (let t = inicio, i = 0; t <= fin && i < 400; t += 86_400_000, i += 1) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** Día de semana ISO (1 = lunes … 7 = domingo), igual que `extract(isodow …)` de Postgres. */
function diaSemanaIso(dia: string): number {
  const d = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * El estado de un conjunto de personas en un período, de un saque.
 *
 * Una consulta por tabla con `in(ids)` y el cruce en memoria, en vez de siete consultas por
 * persona: con 18 personas la diferencia entre 6 consultas y 126 se nota en la pantalla.
 *
 * DEGRADACIÓN. Las columnas de ciclo de `evaluaciones_mensuales` llegaron con la migración 0057;
 * los pagos de liquidación (`sueldo_liquidacion_pagos`) con la 0080. Si alguna de las dos no está
 * aplicada, su bloque cae en su propio `catch` y la pantalla muestra el resto en vez de reventar
 * entera — la lección que este repo ya aprendió en pagos-repo.ts. Lo que se pierde es un
 * indicador, no la pantalla.
 */
export async function estadoDelPeriodo(ids: string[], p: Periodo): Promise<Map<string, EstadoPeriodo>> {
  const mapa = new Map<string, EstadoPeriodo>(ids.map((id) => [id, estadoVacio(id)]));
  if (!ids.length) return mapa;

  const sb = getServerClient();
  const de = (id: unknown) => mapa.get(String(id ?? ''));

  const [rep, asis, inc, pipe] = await Promise.all([
    sb.from('reportes').select('encargado_id').in('encargado_id', ids).gte('fecha', p.desde).lte('fecha', p.hasta),
    sb
      .from('asistencias')
      .select('empleado_id, fecha, condicion, hora_entrada, hora_salida')
      .in('empleado_id', ids)
      .gte('fecha', p.desde)
      .lte('fecha', p.hasta),
    sb.from('incidencias').select('responsable_id').in('responsable_id', ids).gte('fecha', p.desde).lte('fecha', p.hasta),
    sb
      .from('pipeline_puntos')
      .select('empleado_id, puntos')
      .in('empleado_id', ids)
      // La ÚNICA columna timestamptz de estas cuatro consultas: se filtra por día natural de
      // Perú (ver `inicioDiaPeru`). Las otras tres miran columnas `date` y no necesitan nada.
      .gte('fecha', inicioDiaPeru(p.desde))
      .lt('fecha', inicioDiaPeru(diaSiguiente(p.hasta))),
  ]);
  for (const r of [rep, asis, inc, pipe]) {
    if (r.error) throw new Error(r.error.message);
  }

  for (const r of (rep.data as Fila[]) ?? []) {
    const e = de(r.encargado_id);
    if (e) e.reportes += 1;
  }
  for (const r of (inc.data as Fila[]) ?? []) {
    const e = de(r.responsable_id);
    if (e) e.incidencias += 1;
  }
  for (const r of (pipe.data as Fila[]) ?? []) {
    const e = de(r.empleado_id);
    if (e) e.puntosPipeline += Number(r.puntos ?? 0);
  }
  for (const e of mapa.values()) e.puntosPipeline = Math.round(e.puntosPipeline * 100) / 100;

  // Las asistencias se cuentan por DÍA, no por fila: un mismo día puede tener la fila del turno M
  // que dejó un reporte y la del turno T que dejó el huellero. Contar filas inflaría el número y
  // haría creer que está declarado un período que no lo está.
  const diasPorEmpleado = new Map<string, Map<string, { declarado: boolean; sinSalida: boolean }>>();
  for (const r of (asis.data as Fila[]) ?? []) {
    const id = String(r.empleado_id ?? '');
    if (!mapa.has(id)) continue;
    const fecha = String(r.fecha ?? '').slice(0, 10);
    const dias = diasPorEmpleado.get(id) ?? new Map<string, { declarado: boolean; sinSalida: boolean }>();
    const actual = dias.get(fecha) ?? { declarado: false, sinSalida: false };
    actual.declarado = actual.declarado || String(r.condicion ?? 'sin_dato') !== 'sin_dato';
    actual.sinSalida = actual.sinSalida || (r.hora_entrada != null && r.hora_salida == null);
    dias.set(fecha, actual);
    diasPorEmpleado.set(id, dias);
  }

  // Contrato que cubre el período. `estado <> 'borrador'`: un borrador todavía no pacta nada.
  const { data: acu, error: eAcu } = await sb
    .from('sueldo_acuerdos')
    .select('id, empleado_id, fecha_inicio, fecha_fin, estado')
    .in('empleado_id', ids)
    .neq('estado', 'borrador');
  if (eAcu) throw new Error(eAcu.message);

  // El tramo del período que cada acuerdo cubre DE VERDAD: su vigencia intersectada con el rango
  // elegido. Se guardan todos los acuerdos que se solapan y no sólo el primero, porque un período
  // puede quedar partido entre dos contratos (uno termina el 15, el otro empieza el 16) y mirar
  // sólo uno dejaría media quincena fuera del calendario de abajo.
  type TramoContratado = { acuerdoId: string; desde: string; hasta: string };
  const tramosPorEmpleado = new Map<string, TramoContratado[]>();
  for (const r of (acu as Fila[]) ?? []) {
    const empId = String(r.empleado_id ?? '');
    const e = mapa.get(empId);
    if (!e) continue;
    const inicio = String(r.fecha_inicio ?? '').slice(0, 10);
    const fin = r.fecha_fin ? String(r.fecha_fin).slice(0, 10) : null;
    if (!(inicio <= p.hasta && (fin == null || fin >= p.desde))) continue;
    e.contrato = true;
    const tramos = tramosPorEmpleado.get(empId) ?? [];
    tramos.push({
      acuerdoId: String(r.id),
      desde: inicio > p.desde ? inicio : p.desde,
      hasta: fin != null && fin < p.hasta ? fin : p.hasta,
    });
    tramosPorEmpleado.set(empId, tramos);
  }

  // Qué días de la semana contrata cada acuerdo. Sin esto no hay calendario que recorrer: un
  // domingo sin turno no es un día sin declarar, es un día libre.
  //
  // AISLAMIENTO. `sueldo_turnos_select` (0072) deja ver los turnos propios, y todos al
  // administrador. A quien no sea admin le llegan sólo los suyos y el resto de las personas cae al
  // conteo por filas de más abajo — se pierde precisión en un indicador, no se filtra nada.
  const turnosPorAcuerdo = new Map<string, Set<number>>();
  const acuerdoIds = [...tramosPorEmpleado.values()].flat().map((t) => t.acuerdoId);
  if (acuerdoIds.length > 0) {
    const { data: tur, error: eTur } = await sb
      .from('sueldo_acuerdo_turnos')
      .select('acuerdo_id, dia_semana')
      .in('acuerdo_id', acuerdoIds);
    if (eTur) throw new Error(eTur.message);
    for (const r of (tur as Fila[]) ?? []) {
      const acuerdoId = String(r.acuerdo_id ?? '');
      const dia = Number(r.dia_semana ?? 0);
      if (dia < 1 || dia > 7) continue;
      const dias = turnosPorAcuerdo.get(acuerdoId) ?? new Set<number>();
      dias.add(dia);
      turnosPorAcuerdo.set(acuerdoId, dias);
    }
  }

  // El conteo de días, con el MISMO criterio que el motor: recorrer el CALENDARIO del contrato
  // —`generate_series(fecha_inicio, fecha_fin)` en 0085:62-78, heredado tal cual de 0078:139-163—
  // y marcar como sin declarar todo día con turno contratado que no tenga una fila con condición
  // distinta de 'sin_dato'.
  //
  // ANTES ACÁ SE RECORRÍAN SÓLO LAS FILAS QUE EXISTÍAN, que es la medición al revés: un día
  // contratado del que nadie cargó NADA no sumaba a `diasSinDato`, el paso se pintaba verde, y
  // recién al apretar Calcular el motor cortaba con «falta declarar la asistencia de…». Si las dos
  // reglas se vuelven a separar, el hilo vuelve a mentir justo antes de pagar.
  //
  // SIN CALENDARIO LEGIBLE el conteo queda como estaba, por filas: cuando no hay contrato que
  // cubra el período —o el acuerdo todavía no tiene horario cargado, o la RLS no deja ver sus
  // turnos— no hay días contratados que exigir, y contar cero sería peor que contar de menos.
  for (const [id, e] of mapa) {
    const dias = diasPorEmpleado.get(id) ?? new Map<string, { declarado: boolean; sinSalida: boolean }>();
    for (const d of dias.values()) {
      if (d.declarado) e.diasDeclarados += 1;
      if (d.sinSalida) e.diasSinSalida += 1;
    }

    const tramos = (tramosPorEmpleado.get(id) ?? []).filter(
      (t) => (turnosPorAcuerdo.get(t.acuerdoId)?.size ?? 0) > 0,
    );
    if (tramos.length === 0) {
      for (const d of dias.values()) if (!d.declarado) e.diasSinDato += 1;
      continue;
    }

    // Un Set y no un contador: dos tramos contiguos nunca se pisan (la base lo impide con
    // `sueldo_acuerdos_sin_solape`), pero contar por fecha deja el número a salvo igual.
    const sinDeclarar = new Set<string>();
    for (const t of tramos) {
      const contratados = turnosPorAcuerdo.get(t.acuerdoId);
      if (!contratados) continue;
      for (const dia of diasEntre(t.desde, t.hasta)) {
        if (!contratados.has(diaSemanaIso(dia))) continue;
        if (!dias.get(dia)?.declarado) sinDeclarar.add(dia);
      }
    }
    e.diasSinDato = sinDeclarar.size;
  }

  // Evaluación del período: la más reciente cuyo ciclo se solape con el rango elegido.
  try {
    const { data, error } = await sb
      .from('evaluaciones_mensuales')
      .select('empleado_id, nota_final, ciclo_desde, ciclo_hasta, created_at')
      .in('empleado_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const r of (data as Fila[]) ?? []) {
      const e = de(r.empleado_id);
      if (!e || e.nota != null) continue;
      const desde = r.ciclo_desde ? String(r.ciclo_desde).slice(0, 10) : null;
      const hasta = r.ciclo_hasta ? String(r.ciclo_hasta).slice(0, 10) : null;
      if (desde && hasta && (hasta < p.desde || desde > p.hasta)) continue;
      e.nota = Number(r.nota_final ?? 0);
    }
  } catch {
    // 0057 sin aplicar: la nota queda en null y la pantalla lo muestra como "sin evaluar".
  }

  // Pago: la liquidación CERRADA que cubre el período (spec §2.6 R4 — «la liquidación ES el
  // pago»; ROTURA 1 del validador de flujo 23-ago-2026). Antes acá se miraba `pagos`, el sistema
  // viejo — historia congelada (§2.7), no un estado a mostrar: un pago sin ciclo, o un ciclo que
  // no coincide con el período, dejaba el hilo diciendo "falta" para siempre aunque la
  // liquidación ya estuviera pagada. La verdad de hoy vive en `sueldo_liquidaciones` +
  // `sueldo_liquidacion_pagos` — las mismas tablas de la pestaña «Liquidación y pago».
  try {
    const { data: liqs, error: eLiq } = await sb
      .from('sueldo_liquidaciones')
      .select('id, empleado_id, periodo_desde, periodo_hasta, total')
      .in('empleado_id', ids)
      .eq('estado', 'cerrada');
    if (eLiq) throw new Error(eLiq.message);

    // Las liquidaciones CERRADAS de ESTE período por persona: TODAS las que se solapan, no "la
    // primera que calza" (así estaba hasta el 25-ago-2026, sin ORDER BY — el propio comentario de
    // entonces avisaba "si algún día se solapan dos, gana la que la consulta trajo primero", y con
    // la liquidación por tramos dejó de ser hipotético: un período visto acá (p. ej. un ciclo por
    // aniversario de 15-jul a 14-ago) puede solaparse de verdad con DOS tramos mensuales cerrados
    // a la vez, y quedarse con uno solo — al azar según el orden de Postgres — mostraba "Pagada"
    // o "Falta: pago" según qué tramo tocara. Se suman: el total y lo pagado de TODAS las que
    // caen en el rango, nunca se elige una entre varias.
    const liqPorEmpleado = new Map<string, { ids: string[]; total: number }>();
    for (const r of (liqs as Fila[]) ?? []) {
      const empId = String(r.empleado_id ?? '');
      if (!mapa.has(empId)) continue;
      const desde = String(r.periodo_desde ?? '').slice(0, 10);
      const hasta = String(r.periodo_hasta ?? '').slice(0, 10);
      if (desde <= p.hasta && hasta >= p.desde) {
        const acc = liqPorEmpleado.get(empId) ?? { ids: [], total: 0 };
        acc.ids.push(String(r.id));
        acc.total += Number(r.total ?? 0);
        liqPorEmpleado.set(empId, acc);
      }
    }

    if (liqPorEmpleado.size > 0) {
      try {
        // Segunda consulta, en lote: lo pagado de TODAS las liquidaciones encontradas, de un
        // saque — no una por persona. `listarPagosDeLiquidaciones` es la versión sin nombres de
        // `listarPagosLiquidacion` (lib/sueldos-repo.ts), pensada justo para este cruce por lote.
        const pagos = await listarPagosDeLiquidaciones([...liqPorEmpleado.values()].flatMap((v) => v.ids));
        const pagadoPorLiq = new Map<string, number>();
        for (const pago of pagos) {
          pagadoPorLiq.set(pago.liquidacionId, (pagadoPorLiq.get(pago.liquidacionId) ?? 0) + pago.monto);
        }

        for (const [empId, liq] of liqPorEmpleado) {
          const e = mapa.get(empId);
          if (!e) continue;
          const pagadoCrudo = liq.ids.reduce((s, id) => s + (pagadoPorLiq.get(id) ?? 0), 0);
          const pagado = Math.round(pagadoCrudo * 100) / 100;
          if (liq.total <= 0) e.pago = { tipo: 'sin_monto' };
          else if (pagado >= liq.total) e.pago = { tipo: 'pagada', total: liq.total, pagado };
          else e.pago = { tipo: 'pendiente', total: liq.total, pagado };
        }
      } catch (e) {
        if (!(e instanceof LiquidacionPagosNoMigradoError)) throw e;
        // 0080 sin aplicar: se sabe que hay una liquidación cerrada pero no lo pagado. 'sin_dato'
        // y no 'sin_liquidacion' — decir "falta registrarlo" mentiría sobre algo que sí existe.
        for (const empId of liqPorEmpleado.keys()) {
          const e2 = mapa.get(empId);
          if (e2) e2.pago = { tipo: 'sin_dato' };
        }
      }
    }
  } catch {
    // Falla la consulta a `sueldo_liquidaciones` (o cualquier otra cosa no capturada arriba): el
    // indicador de pago se queda en su default ('sin_liquidacion') en vez de tirar abajo la lista
    // entera — mismo criterio que 'evaluación' más arriba. Nunca cae al viejo `pagos`: esa tabla
    // es historia congelada (§2.7), no un estado a mostrar.
  }

  return mapa;
}

/** El estado de UNA persona. Mismo camino que el de todas, para que no haya dos verdades. */
export async function estadoDeColaborador(id: string, p: Periodo): Promise<EstadoPeriodo> {
  const mapa = await estadoDelPeriodo([id], p);
  return mapa.get(id) ?? estadoVacio(id);
}
