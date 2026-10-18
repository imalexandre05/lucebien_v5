import {
  actAplicaHoy,
  turnosQueBloquean,
  type ActividadConfig,
  type EstadoEnvio,
  type Reporte,
  type ReporteActividad,
  type ReporteDetalle,
  type ReporteExtra,
  type TurnoReporte,
} from '@scilb/core';
import { getServerClient } from './supabase/server';
import { directorio, mapaNombres } from './directorio';

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
  // Puente defensivo (Fase 4, migración 0052): columna nueva. `select('*')` no la pide por
  // nombre explícito, así que si la migración aún no corrió simplemente no viene en la fila
  // (undefined) en vez de que Postgres tire error — igual que rol_cod en getSesion() (Fase 1).
  estado_envio?: EstadoEnvio | null;
  created_at: string;
};

// Mapa id→nombre de empleados. OJO RLS: un no-admin solo se ve a sí mismo (policy emp_select
// de 0002), así que para él los nombres de terceros saldrán null hasta que exista una policy
// de "directorio" en empleados. Para admin/dueño resuelve todos.
async function nombresEmpleados(): Promise<(id: string | null) => string | null> {
  const map = await mapaNombres();
  return (id) => (id ? map.get(id) ?? null : null);
}

// Deriva estadoEnvio incluso sin la columna nueva (pre-migración 0052): mismo cálculo que hace el
// backfill SQL, a partir de auto_enviado/no_evaluable que sí existen desde 0014/0021.
function derivarEstadoEnvio(r: Pick<RepRow, 'estado_envio' | 'auto_enviado' | 'no_evaluable'>): EstadoEnvio {
  if (r.estado_envio) return r.estado_envio;
  if (!r.auto_enviado) return 'enviado';
  return r.no_evaluable ? 'sin_actividad' : 'no_enviado';
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
    estadoEnvio: derivarEstadoEnvio(r),
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
  const nombre = await nombresEmpleados();

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

// "Mis reportes" (spec 2026-09-12): los últimos reportes que ESTA persona llenó
// (encargado_id = ella). No resuelve nombres de terceros -- no hacen falta para una lista de "lo
// mío". RLS de `rep_select` (0081) ya es por sede, no por encargado: este filtro es sólo de la
// aplicación, no una puerta nueva.
export async function listarReportesDe(usuarioId: string, limite = 10): Promise<Reporte[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reportes')
    .select('*')
    .eq('encargado_id', usuarioId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  const rows = (data as RepRow[]) ?? [];
  return rows.map((r) => baseReporte(r, () => null, []));
}

// Detalle completo: reporte + actividades + extras + trabajadores.
export async function obtenerReporte(id: string): Promise<ReporteDetalle | null> {
  const sb = getServerClient();
  const { data, error } = await sb.from('reportes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as RepRow;
  const nombre = await nombresEmpleados();

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
    // cod/peso_unitario/puntos_total/revisar: columnas nuevas de la migración 0053. select('*')
    // ya cubre el caso "migración no aplicada" (undefined en vez de error) — mismo patrón que
    // estado_envio en baseReporte().
    cod: (e.cod as string | null) ?? null,
    cantidad: Number(e.cantidad ?? 1),
    montoTotal: Number(e.monto_total ?? 0),
    precioUnitario: Number(e.precio_unitario ?? 0),
    pesoUnitario: Number(e.peso_unitario ?? 0),
    puntosTotal: Number(e.puntos_total ?? 0),
    revisar: Boolean(e.revisar ?? false),
    detalle: (e.detalle as string | null) ?? null,
    registradoPorId: (e.registrado_por_id as string | null) ?? null,
    registradoPorNombre: nombre((e.registrado_por_id as string | null) ?? null),
  }));

  return { ...baseReporte(r, nombre, trabajadores), actividades, extras };
}

// ── Catálogo de actividades del turno ────────────────────────────────────────

export type ActividadDelTurno = ActividadConfig & { pendienteAcumulado: boolean };

type ActCfgRow = {
  id: string;
  cod: string;
  nombre: string;
  categoria: string | null;
  tipo_act: string | null;
  peso: number | null;
  activa: boolean;
  turno: string | null;
  frecuencia_dias: number | null;
  dia_semana: string | null;
  aparece_dia: number | null;
  acumula: boolean | null;
  precio_unitario: number | null;
  unidad: string | null;
  orden: number | null;
};

const fromCfg = (r: ActCfgRow): ActividadConfig => ({
  id: r.id,
  cod: r.cod,
  nombre: r.nombre,
  categoria: r.categoria,
  tipoAct: r.tipo_act ?? 'obligatoria',
  peso: Number(r.peso ?? 0),
  activa: Boolean(r.activa),
  turno: r.turno ?? 'ambos',
  frecuenciaDias: Number(r.frecuencia_dias ?? 0),
  diaSemana: r.dia_semana,
  apareceDia: Number(r.aparece_dia ?? 0),
  acumula: Boolean(r.acumula),
  precioUnitario: Number(r.precio_unitario ?? 0),
  unidad: r.unidad,
  orden: Number(r.orden ?? 0),
});

// Actividades obligatorias que aplican en la sede/fecha/turno (filtra con actAplicaHoy del core),
// más las pendientes acumuladas de turnos previos. Espeja routes/actividades.js GET /.
export async function listarActividadesConfig(
  sede: string,
  fecha: string,
  turno: TurnoReporte,
): Promise<ActividadDelTurno[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('actividades_config')
    .select('*')
    .eq('sede_cod', sede)
    .eq('activa', true)
    .order('orden', { ascending: true })
    .order('cod', { ascending: true });
  if (error) throw new Error(error.message);

  const all = ((data as ActCfgRow[]) ?? []).map(fromCfg);
  const obligatorias = all.filter((a) => a.tipoAct === 'obligatoria' || (!a.tipoAct && a.categoria !== 'EXT'));

  // Pendientes acumuladas (no resueltas) de la sede.
  const { data: pend } = await sb
    .from('actividades_pendientes')
    .select('act_cod')
    .eq('sede_cod', sede)
    .eq('resuelta', false);
  const pendientes = new Set(((pend as { act_cod: string }[]) ?? []).map((p) => p.act_cod));

  const aplican = obligatorias
    .filter((a) => actAplicaHoy(a, fecha, turno))
    .map((a) => ({ ...a, pendienteAcumulado: pendientes.has(a.cod) }));

  // Agrega actividades acumulables que están pendientes pero hoy no aplicaban.
  const codsHoy = new Set(aplican.map((a) => a.cod));
  for (const a of obligatorias) {
    if (a.acumula && pendientes.has(a.cod) && !codsHoy.has(a.cod)) {
      aplican.push({ ...a, pendienteAcumulado: true });
    }
  }
  return aplican;
}

// ── Catálogo de extras con puntaje (Fase 5 tarea 3) ──────────────────────────
// Mismas filas de actividades_config que listarActividadesConfig ya trae, pero filtradas al
// revés: solo categoria='EXT' (el catálogo cerrado de 17 extras portado de database/seed.js,
// migración 0053), en vez de las obligatorias. Consulta propia (no reutiliza el array de arriba)
// para no acoplar el formulario de extras a los filtros de "qué actividad obligatoria aplica hoy"
// — un extra no depende de frecuencia/día, solo de estar activo en la sede.
export type ExtraCatalogo = {
  cod: string;
  nombre: string;
  tipoAct: string; // 'remunerada' | 'por_puntos'
  peso: number; // puntos por unidad — se muestra en las tarjetas del selector (selector-extras.tsx)
  precioUnitario: number; // soles por unidad — 0 en 'por_puntos'
  unidad: string;
};

export async function listarExtrasCatalogo(sede: string): Promise<ExtraCatalogo[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('actividades_config')
    .select('*')
    .eq('sede_cod', sede)
    .eq('categoria', 'EXT')
    .eq('activa', true)
    .order('orden', { ascending: true })
    .order('cod', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    cod: String(r.cod),
    nombre: String(r.nombre ?? ''),
    tipoAct: String(r.tipo_act ?? 'por_puntos'),
    peso: Number(r.peso ?? 0),
    precioUnitario: Number(r.precio_unitario ?? 0),
    unidad: String(r.unidad ?? 'unidad'),
  }));
}

// Empleados (id+nombre+rol+sede) para elegir trabajadores/encargado del turno. El rol/sede
// se muestran como tag en el picker (espeja las "tiendas" del SCI viejo). OJO RLS: un no-admin
// solo se ve a sí mismo (policy emp_select); el directorio completo es decisión diferida.
export type EmpPicker = { id: string; nombre: string; rol: string; sedeCod: string | null };
export async function listarEmpleados(): Promise<EmpPicker[]> {
  const items = await directorio();
  return items
    .map((d) => ({ id: d.id, nombre: d.nombre, rol: d.rol, sedeCod: d.sedeCod }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ¿Ya existe un reporte para esta sede/fecha/turno? Devuelve id + estadoEnvio (para enrutar a
// evaluación, como el viejo: si el turno ya se envió, la pantalla pasa a Evaluación) — el
// estadoEnvio deja distinguir en la UI un envío real de uno auto-cerrado (Fase 4 tarea 4).
export type YaEnviado = { id: string; estadoEnvio: EstadoEnvio } | null;
export async function buscarReporteId(sede: string, fecha: string, turno: string): Promise<YaEnviado> {
  const sb = getServerClient();
  // select('*') a propósito (no una lista explícita con estado_envio): así, si la migración 0052
  // todavía no corrió, Postgres simplemente no devuelve esa columna (undefined) en vez de tirar
  // "column does not exist" — pedirla por nombre explícito SÍ revienta contra una BD sin migrar
  // (lo mismo que evita baseReporte() más arriba).
  const { data, error } = await sb
    .from('reportes')
    .select('*')
    .eq('sede_cod', sede)
    .eq('fecha', fecha)
    .eq('turno', turno)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as RepRow | null;
  return row ? { id: row.id, estadoEnvio: derivarEstadoEnvio(row) } : null;
}

// Tarea 2: el reporte anterior de la sede (cualquier turno/fecha) que aún no se evaluó ni quedó
// sin actividad. Espeja el criterio de estadoReporte()==='pendiente' del core. Es advisory (mismo
// rol que buscarConflictoTurno) — el RPC reportes_crear vuelve a validarlo server-side (0052).
export type ReportePendiente = { id: string; sedeCod: string; fecha: string; turno: TurnoReporte } | null;
export async function buscarReportePendienteSede(sede: string): Promise<ReportePendiente> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reportes')
    .select('id, sede_cod, fecha, turno')
    .eq('sede_cod', sede)
    .eq('evaluado', false)
    .eq('no_evaluable', false)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; sede_cod: string; fecha: string; turno: string } | null;
  return row ? { id: row.id, sedeCod: row.sede_cod, fecha: row.fecha.slice(0, 10), turno: row.turno as TurnoReporte } : null;
}

// Exclusividad de turno: si ya existe un reporte REAL (no un stub vacío del auto-cierre) de un
// turno que bloquea al solicitado (ver turnosQueBloquean en el core), no se puede crear otro.
// Distinto de "ya enviado" (que es el MISMO turno exacto, y pasa a evaluación); esto es un turno
// DISTINTO que ya cubrió el horario. Los reportes no_evaluable=true son placeholders que el cron
// de auto-cierre crea cuando nadie reportó ese turno (0 actividades, sin encargado): no cuentan
// como "horario cubierto", si no un colaborador que sí trabajó quedaría bloqueado sin motivo.
export type ConflictoTurno = { turno: TurnoReporte; id: string } | null;
export async function buscarConflictoTurno(sede: string, fecha: string, turno: TurnoReporte): Promise<ConflictoTurno> {
  const bloqueantes = turnosQueBloquean(turno);
  if (bloqueantes.length === 0) return null;
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reportes')
    .select('id, turno')
    .eq('sede_cod', sede)
    .eq('fecha', fecha)
    .eq('no_evaluable', false)
    .in('turno', bloqueantes)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; turno: string } | null;
  return row ? { turno: row.turno as TurnoReporte, id: row.id } : null;
}

// ── Mutaciones vía RPC (atómicas, security invoker → RLS real; ver 0020) ─────

// Error tipado del RPC (tareas 2/3, migración 0052): reportes_crear rechaza con una excepción
// prefijada 'PREFIJO:id' cuando hay un conflicto de turno o un reporte anterior sin evaluar.
// bloqueoId deja que la UI enlace directo al reporte causante en vez de un mensaje mudo.
export class ReporteCrearError extends Error {
  bloqueoId?: string;
  tipo?: 'turno_conflicto' | 'reporte_pendiente' | 'permiso';
  constructor(message: string, tipo?: 'turno_conflicto' | 'reporte_pendiente' | 'permiso', bloqueoId?: string) {
    super(message);
    this.tipo = tipo;
    this.bloqueoId = bloqueoId;
  }
}

function parsearErrorCrear(mensaje: string): ReporteCrearError {
  const conflicto = mensaje.match(/^TURNO_CONFLICTO:(.+)$/);
  if (conflicto) {
    return new ReporteCrearError(
      'Ese horario ya está cubierto por otro reporte de la sede.',
      'turno_conflicto',
      conflicto[1],
    );
  }
  const pendiente = mensaje.match(/^REPORTE_PENDIENTE:(.+)$/);
  if (pendiente) {
    return new ReporteCrearError(
      'Hay un reporte anterior de esta sede pendiente de evaluación. Evalúalo antes de crear uno nuevo.',
      'reporte_pendiente',
      pendiente[1],
    );
  }
  // Desde la migración 0081 las dos RPC son `security definer` y llevan su propio control de sede
  // adentro (antes lo ponía la política de la tabla). Cuando ese control corta, el mensaje llega
  // con el prefijo `PERMISO:` y sin esto la pantalla mostraba el texto crudo de Postgres.
  const permiso = mensaje.match(/^PERMISO:\s*(.+)$/);
  if (permiso) return new ReporteCrearError(mayuscula(permiso[1]), 'permiso');

  return new ReporteCrearError(mensaje);
}

/** El mensaje viene de la base en minúscula; en pantalla se lee como una frase. */
function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export async function crearReporte(p: {
  id: string;
  sede: string;
  turno: string;
  encargado?: string | null;
  actTotal: number;
  actDone: number;
  trabajadores: string[];
  actividades: { cod: string; nombre: string; cat: string | null; peso: number; obs: string }[];
  // cod (Fase 5 tarea 3): enlaza con el catálogo de actividades_config (categoria='EXT') para que
  // el RPC derive precio_unitario/peso server-side — null en los extras "libres". precio_unitario/
  // monto_total ya NO se mandan desde el cliente (el RPC los ignora si vinieran): son insumo de
  // pago/desempeño, el server es quien decide.
  extras: { cod: string | null; tipo: string; nombre: string; cantidad: number; detalle: string; registrado_por_id: string | null }[];
}): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('reportes_crear', {
    p_id: p.id,
    p_sede: p.sede,
    p_turno: p.turno,
    p_act_total: p.actTotal,
    p_act_done: p.actDone,
    p_trabajadores: p.trabajadores,
    p_actividades: p.actividades,
    p_extras: p.extras,
    p_encargado: p.encargado ?? null,
  });
  if (error) throw parsearErrorCrear(error.message);
  return String(data);
}

export async function evaluarReporte(
  id: string,
  calificaciones: { cod: string; cal: number; obs: string }[],
): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('reportes_evaluar', { p_id: id, p_calificaciones: calificaciones });
  // Mismo motivo que en crearReporte: el control de sede de la 0081 corta con `PERMISO:` y sin
  // esto la persona veía el texto crudo de Postgres en vez de una explicación.
  // La 0113 corta con `DATO:` (rango, actividades que no coinciden) o `ESTADO:` (ya evaluado).
  const validacion = error?.message.match(/^(?:DATO|ESTADO):\s*(.+)$/);
  if (validacion) throw new Error(mayuscula(validacion[1]));
  if (error) throw parsearErrorCrear(error.message);
  return Number(data) || 0;
}

export async function anularReporte(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('reportes_anular', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function anularEval(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('reportes_anular_eval', { p_id: id });
  if (error) throw new Error(error.message);
}

// Auto-asistencia: marca presentes al encargado + trabajadores del reporte (fuente='reporte').
export async function marcarAsistenciaReporte(reporteId: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('reportes_marcar_asistencia', { p_reporte_id: reporteId });
  if (error) throw new Error(error.message);
}

// ── Drafts (autosave del formulario) ─────────────────────────────────────────

export type DraftReporte = {
  encargadoId: string | null;
  payload: Record<string, unknown>;
  updatedAt: string;
};

export async function getDraft(sede: string, fecha: string, turno: string): Promise<DraftReporte | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('reporte_drafts')
    .select('encargado_id, payload, updated_at')
    .eq('sede_cod', sede)
    .eq('fecha', fecha)
    .eq('turno', turno)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as { encargado_id: string | null; payload: Record<string, unknown>; updated_at: string };
  return { encargadoId: d.encargado_id, payload: d.payload ?? {}, updatedAt: d.updated_at };
}

export async function saveDraft(p: {
  sede: string;
  fecha: string;
  turno: string;
  encargadoId: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('reporte_drafts').upsert(
    {
      sede_cod: p.sede,
      fecha: p.fecha,
      turno: p.turno,
      encargado_id: p.encargadoId,
      payload: p.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sede_cod,fecha,turno' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteDraft(sede: string, fecha: string, turno: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('reporte_drafts')
    .delete()
    .eq('sede_cod', sede)
    .eq('fecha', fecha)
    .eq('turno', turno);
  if (error) throw new Error(error.message);
}

// ── Layout de limpieza (mapa de zonas por sede) ──────────────────────────────

export type LayoutZona = {
  id: number;
  cod: string;
  nombre: string;
  turno: string; // 'mañana' | 'tarde' | 'ambos'
  tipo: string; // 'area' no puntúa; el resto sí
  peso: number;
  posX: number;
  posY: number;
  ancho: number;
  alto: number;
  color: string;
  forma: string; // 'rect' | 'circle' | 'tri' | 'special'
  nivel: string;
  sobreCod: string;
};

export async function listarLayoutZonas(sede: string): Promise<LayoutZona[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('layout_zonas')
    .select('*')
    .eq('sede_cod', sede)
    .order('orden', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: Number(r.id),
    cod: String(r.cod),
    nombre: String(r.nombre),
    turno: String(r.turno ?? 'ambos'),
    tipo: String(r.tipo ?? 'mueble'),
    peso: Number(r.peso ?? 0),
    posX: Number(r.pos_x ?? 0),
    posY: Number(r.pos_y ?? 0),
    ancho: Number(r.ancho ?? 0),
    alto: Number(r.alto ?? 0),
    color: String(r.color ?? '#3b82f6'),
    forma: String(r.forma ?? 'rect'),
    nivel: String(r.nivel ?? 'piso'),
    sobreCod: String(r.sobre_cod ?? ''),
  }));
}
