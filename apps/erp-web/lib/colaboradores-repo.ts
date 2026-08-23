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
};

/** Las personas activas, para el selector y la lista. Consulta liviana a propósito. */
export async function listarColaboradores(): Promise<Colaborador[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleados')
    .select('id, nombre, iniciales, rol, rol_cod, sede_cod, fecha_ingreso, salario_base')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    iniciales: (r.iniciales as string | null) ?? null,
    rol: String(r.rol ?? ''),
    rolCod: (r.rol_cod as string | null) ?? null,
    sedeCod: (r.sede_cod as string | null) ?? null,
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    salarioBase: Number(r.salario_base ?? 0),
  }));
}

export async function obtenerColaborador(id: string): Promise<Colaborador | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleados')
    .select('id, nombre, iniciales, rol, rol_cod, sede_cod, fecha_ingreso, salario_base')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    iniciales: (r.iniciales as string | null) ?? null,
    rol: String(r.rol ?? ''),
    rolCod: (r.rol_cod as string | null) ?? null,
    sedeCod: (r.sede_cod as string | null) ?? null,
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    salarioBase: Number(r.salario_base ?? 0),
  };
}

type Fila = Record<string, unknown>;

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
      .gte('fecha', p.desde)
      .lte('fecha', p.hasta),
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
  for (const [id, dias] of diasPorEmpleado) {
    const e = mapa.get(id);
    if (!e) continue;
    for (const d of dias.values()) {
      if (d.declarado) e.diasDeclarados += 1;
      else e.diasSinDato += 1;
      if (d.sinSalida) e.diasSinSalida += 1;
    }
  }

  // Contrato que cubre el período. `estado <> 'borrador'`: un borrador todavía no pacta nada.
  const { data: acu, error: eAcu } = await sb
    .from('sueldo_acuerdos')
    .select('empleado_id, fecha_inicio, fecha_fin, estado')
    .in('empleado_id', ids)
    .neq('estado', 'borrador');
  if (eAcu) throw new Error(eAcu.message);
  for (const r of (acu as Fila[]) ?? []) {
    const e = de(r.empleado_id);
    if (!e || e.contrato) continue;
    const inicio = String(r.fecha_inicio ?? '').slice(0, 10);
    const fin = r.fecha_fin ? String(r.fecha_fin).slice(0, 10) : null;
    if (inicio <= p.hasta && (fin == null || fin >= p.desde)) e.contrato = true;
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

    // La liquidación de ESTE período por persona: la primera cerrada cuyo rango se solapa, mismo
    // criterio de "primera que calza" que ya usan 'contrato' y 'evaluación' arriba. Con las
    // liquidaciones mensuales de hoy no hay ambigüedad real; si algún día se solapan dos, gana la
    // que la consulta trajo primero.
    const liqPorEmpleado = new Map<string, { id: string; total: number }>();
    for (const r of (liqs as Fila[]) ?? []) {
      const empId = String(r.empleado_id ?? '');
      if (!mapa.has(empId) || liqPorEmpleado.has(empId)) continue;
      const desde = String(r.periodo_desde ?? '').slice(0, 10);
      const hasta = String(r.periodo_hasta ?? '').slice(0, 10);
      if (desde <= p.hasta && hasta >= p.desde) liqPorEmpleado.set(empId, { id: String(r.id), total: Number(r.total ?? 0) });
    }

    if (liqPorEmpleado.size > 0) {
      try {
        // Segunda consulta, en lote: lo pagado de TODAS las liquidaciones encontradas, de un
        // saque — no una por persona. `listarPagosDeLiquidaciones` es la versión sin nombres de
        // `listarPagosLiquidacion` (lib/sueldos-repo.ts), pensada justo para este cruce por lote.
        const pagos = await listarPagosDeLiquidaciones([...liqPorEmpleado.values()].map((v) => v.id));
        const pagadoPorLiq = new Map<string, number>();
        for (const pago of pagos) {
          pagadoPorLiq.set(pago.liquidacionId, (pagadoPorLiq.get(pago.liquidacionId) ?? 0) + pago.monto);
        }

        for (const [empId, liq] of liqPorEmpleado) {
          const e = mapa.get(empId);
          if (!e) continue;
          const pagado = Math.round((pagadoPorLiq.get(liq.id) ?? 0) * 100) / 100;
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
