import {
  VALORES,
  promediosPorValor,
  notaValores360,
  puedeEvaluarValores,
  puedeEvaluarValoresHoy,
  type ValorKey,
  type PuntajeValores,
  type ConfigVentanaValores,
} from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getSesion } from './auth';
import { leerConfigMap } from './config-repo';
import { hoyPeru } from './fechas';

// Valores 360° (Fase 12 tarea 1) — peer review de 6 valores. Puerto de routes/valores.js
// (sistema viejo, nunca migrado). Usa app_directorio_activos() (migración 0057) en vez del
// app_directorio() general: necesitamos SOLO empleados activos (routes/valores.js:70/:120
// filtraba `WHERE activo=1`), cosa que el directorio general no hace a propósito (resuelve
// nombres históricos también).
export type CompaneroValor = { id: string; nombre: string; evaluado: boolean };

// "Falta aplicar la migración 0057" — degradación elegante (mismo patrón que
// SolicitudesNoMigradoError en solicitudes-repo.ts, lección explícita de la Fase 4/7): /valores es
// un módulo enteramente NUEVO (no existía nada antes de esta fase), así que CUALQUIER lectura de
// evaluaciones_valores o de app_directorio_activos() falla igual sin la migración — la página debe
// avisar, no reventar con un 500.
export class ValoresNoMigradoError extends Error {
  constructor() {
    super('Falta aplicar la migración 0057 (tabla evaluaciones_valores y función app_directorio_activos).');
    this.name = 'ValoresNoMigradoError';
  }
}

function esTablaOFuncionInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    error.code === '42P01' ||
    error.code === '42883' ||
    /could not find the table/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

async function directorioActivos(sb: ReturnType<typeof getServerClient>): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await sb.rpc('app_directorio_activos');
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new ValoresNoMigradoError();
    throw new Error(error.message);
  }
  return ((data as { id: string; nombre: string }[]) ?? []).map((d) => ({ id: String(d.id), nombre: d.nombre }));
}

// Compañeros a evaluar este mes (todos los activos menos el propio usuario) + si ya se evaluó.
// Puerto de routes/valores.js:116-126 (GET /mis-pendientes/:mes). Pendientes primero.
export async function companerosParaEvaluar(evaluadorId: string, mes: string): Promise<CompaneroValor[]> {
  const sb = getServerClient();
  const [dir, yaEval] = await Promise.all([
    directorioActivos(sb),
    sb.from('evaluaciones_valores').select('evaluado_id').eq('evaluador_id', evaluadorId).eq('mes', mes),
  ]);
  if (yaEval.error) {
    if (esTablaOFuncionInexistente(yaEval.error)) throw new ValoresNoMigradoError();
    throw new Error(yaEval.error.message);
  }
  const evaluados = new Set((yaEval.data ?? []).map((r) => String((r as { evaluado_id: string }).evaluado_id)));
  return dir
    .filter((d) => d.id !== evaluadorId)
    .map((d) => ({ id: d.id, nombre: d.nombre, evaluado: evaluados.has(d.id) }))
    .sort((a, b) => Number(a.evaluado) - Number(b.evaluado) || a.nombre.localeCompare(b.nombre));
}

// Ventana de habilitación (Fase 13 tarea 3, migración 0058 — claves valores_habilitado/modo/
// dia_inicio/dia_fin). Defaults iguales al catálogo (lib/config-catalogo.ts) por si la migración
// todavía no corrió y las filas no existen: habilitado + modo 'siempre' = CERO restricción, el
// mismo comportamiento que tenía /valores antes de esta fase.
async function leerVentanaValores(): Promise<ConfigVentanaValores> {
  const cfg = await leerConfigMap();
  return {
    habilitado: (cfg.valores_habilitado ?? 'true') !== 'false',
    modo: cfg.valores_modo === 'ventana' ? 'ventana' : 'siempre',
    diaInicio: Number(cfg.valores_dia_inicio ?? '1') || 1,
    diaFin: Number(cfg.valores_dia_fin ?? '31') || 31,
  };
}

// Para que la página muestre un aviso ANTES de que alguien llene el formulario entero y se
// encuentre el rechazo recién al enviar (mismo espíritu que el resto del ERP: avisar, no fallar
// en silencio). El repo (enviarEvaluacionValores, abajo) sigue siendo la autoridad real — este
// estado es solo para la UI.
export async function estadoVentanaValores(): Promise<{ abierto: boolean; mensaje: string | null }> {
  const cfg = await leerVentanaValores();
  if (!cfg.habilitado) {
    return { abierto: false, mensaje: 'El módulo de Valores 360° está deshabilitado desde Configuración. No se pueden enviar evaluaciones nuevas.' };
  }
  if (cfg.modo === 'siempre') return { abierto: true, mensaje: null };
  const diaHoy = Number(hoyPeru().slice(8, 10));
  const abierto = puedeEvaluarValoresHoy(cfg, diaHoy);
  if (abierto) return { abierto: true, mensaje: null };
  const desde = Math.min(cfg.diaInicio, cfg.diaFin);
  const hasta = Math.max(cfg.diaInicio, cfg.diaFin);
  return { abierto: false, mensaje: `Las evaluaciones de Valores 360° solo se pueden enviar entre el día ${desde} y el día ${hasta} de cada mes.` };
}

// Guarda (o corrige, si ya existía este mes) la evaluación de un compañero. Puerto de
// routes/valores.js:102-113 (POST /) — INSERT OR REPLACE se traduce a upsert por la unique
// (evaluador_id, evaluado_id, mes) de la migración 0057.
export async function enviarEvaluacionValores(
  evaluadorId: string,
  evaluadoId: string,
  mes: string,
  puntaje: PuntajeValores,
): Promise<void> {
  if (!puedeEvaluarValores(evaluadorId, evaluadoId)) throw new Error('No puedes evaluarte a ti mismo');
  const ventana = await estadoVentanaValores();
  if (!ventana.abierto) throw new Error(ventana.mensaje ?? 'Las evaluaciones de Valores 360° están cerradas en este momento.');
  const sb = getServerClient();
  const { error } = await sb
    .from('evaluaciones_valores')
    .upsert(
      { evaluador_id: evaluadorId, evaluado_id: evaluadoId, mes, ...puntaje },
      { onConflict: 'evaluador_id,evaluado_id,mes' },
    );
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new ValoresNoMigradoError();
    throw new Error(error.message);
  }
}

// Mínimo de evaluaciones recibidas para mostrarle a alguien su resultado. Default 3, editable en
// /configuracion (`valores_min_evaluaciones`, migración 0116). La misma regla vive en la función SQL
// `valores_mis_puntajes`, que es la que de verdad decide: acá sólo sirve para el texto de la pantalla.
// Un valor ausente o que no sea un entero >= 1 cae a 3, NUNCA a 0 (apagaría el anonimato en silencio).
export const MINIMO_EVALUACIONES_VALORES_DEFAULT = 3;

export function minimoEvaluacionesValores(cfg: Record<string, string>): number {
  const crudo = (cfg.valores_min_evaluaciones ?? '').trim();
  // 1 a 3 dígitos, igual que la función SQL (0116): un valor más largo cae a 3 en las dos capas.
  const n = /^\d{1,3}$/.test(crudo) ? Number(crudo) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : MINIMO_EVALUACIONES_VALORES_DEFAULT;
}

export type MiResumenValores = {
  // Mes del resultado mostrado. Para quien mira lo suyo es el último mes YA CERRADO que cumple el
  // mínimo (0116), no el mes en curso: nunca en vivo. `null` si no hay ninguno.
  mes: string | null;
  // `null` cuando todavía no alcanza el mínimo: ni la cantidad se revela («hay 2» ya es información).
  recibidas: number | null;
  promedios: Partial<Record<ValorKey, number>> | null;
  nota20: number | null;
  minimoEvaluaciones: number;
  // false = no se muestra el resultado todavía (menos evaluaciones que el mínimo). El administrador
  // mirando a OTRA persona siempre ve todo, así que ahí es true.
  suficientes: boolean;
};

// Mi resumen del mes: promedio recibido por valor + nota/20, SIN revelar quién evaluó.
//
// EL ANONIMATO NO PUEDE DEPENDER DE ESTE `select`. La base ya no deja leer a nadie las filas que lo
// nombran (política `eval_valores_select`, 0116: sólo el administrador y quien envió). Lo propio
// llega por la función `security definer` `valores_mis_puntajes`, que devuelve a lo sumo UNA fila
// —la cantidad y el promedio por valor— y sólo si hay al menos el mínimo de evaluaciones (default 3).
// Con menos devuelve vacío. Antes devolvía el vector de cada evaluador, y con una o dos evaluaciones
// eso identificaba a quien puntuó. Puerto de routes/valores.js:200-219.
//
// DOS CAMINOS, NO UNO. La misma función la usan dos pantallas: «Valores 360°», donde alguien mira lo
// suyo, y la ficha de una persona en Personal, donde el administrador mira lo de otro. Lo propio pasa
// por la función. Lo ajeno lee la tabla, donde la política decide quién puede: sólo un administrador
// ve algo (y ve todo, sin mínimo); cualquier otro que intente mirar la ficha ajena se lleva cero filas.
export async function miResumenValores(empleadoId: string, mes: string): Promise<MiResumenValores> {
  const sb = getServerClient();
  const sesion = await getSesion();
  const esPropio = sesion?.usuario.id === empleadoId;
  const minimoEvaluaciones = minimoEvaluacionesValores(await leerConfigMap());

  if (esPropio) {
    // Sin `p_mes`: la función elige el último mes cerrado que cumple el mínimo (spec §6). Lo que
    // pida la pantalla («este mes») no importa: el mes en curso nunca se ve en vivo.
    const { data, error } = await sb.rpc('valores_mis_puntajes');
    // Función ausente o anterior a 0116 (no acepta la llamada sin argumento): no hay nada seguro que
    // mostrar, así que se trata como «aún no hay resultado» en vez de caerse o, peor, calcular sobre
    // el formato viejo, que traía el voto de cada evaluador.
    if (error && !esTablaOFuncionInexistente(error)) throw new Error(error.message);
    const fila = error ? undefined : ((data as MiResultadoValoresFila[] | null) ?? [])[0];
    if (!fila || fila.cantidad == null) {
      return { mes: null, recibidas: null, promedios: null, nota20: null, minimoEvaluaciones, suficientes: false };
    }
    const promedios: Partial<Record<ValorKey, number>> = {};
    for (const { key } of VALORES) promedios[key] = Number(fila[key]);
    return {
      mes: String(fila.mes),
      recibidas: Number(fila.cantidad),
      promedios,
      nota20: notaValores360(promedios),
      minimoEvaluaciones,
      suficientes: true,
    };
  }

  const { data, error } = await sb
    .from('evaluaciones_valores')
    .select('integridad, respeto, honestidad, amabilidad, relacion, actitud')
    .eq('evaluado_id', empleadoId)
    .eq('mes', mes);
  if (error) {
    if (esTablaOFuncionInexistente(error)) throw new ValoresNoMigradoError();
    throw new Error(error.message);
  }
  const rows = (data as PuntajeValores[]) ?? [];
  if (!rows.length) return { mes, recibidas: 0, promedios: null, nota20: null, minimoEvaluaciones, suficientes: true };
  const promedios = promediosPorValor(rows);
  return { mes, recibidas: rows.length, promedios, nota20: notaValores360(promedios), minimoEvaluaciones, suficientes: true };
}

// Lo que devuelve `valores_mis_puntajes` (0116): el mes, la cantidad y el promedio por valor. Nada por evaluador.
type MiResultadoValoresFila = { mes: string; cantidad: number } & Record<ValorKey, number | string>;

export type SeguimientoValorFila = {
  id: string;
  nombre: string;
  recibidas: number;
  enviadas: number;
  debeEnviar: number;
  cumplimiento: number;
  promedios: Partial<Record<ValorKey, number>>;
  nota20: number | null;
  faltantes: { id: string; nombre: string }[];
};

// Seguimiento admin: cumplimiento por empleado (quién evaluó, a quién le falta, promedios, nota).
// Puerto de routes/valores.js:137-198 (GET /seguimiento/:mes).
export async function seguimientoValores(mes: string): Promise<{
  filas: SeguimientoValorFila[];
  totalEmpleados: number;
  totalEvaluaciones: number;
  cumplimientoGlobal: number;
}> {
  const sb = getServerClient();
  const [dir, evalsRes] = await Promise.all([
    directorioActivos(sb),
    sb.from('evaluaciones_valores').select('*').eq('mes', mes),
  ]);
  if (evalsRes.error) {
    if (esTablaOFuncionInexistente(evalsRes.error)) throw new ValoresNoMigradoError();
    throw new Error(evalsRes.error.message);
  }
  const evals = (evalsRes.data as (PuntajeValores & { evaluador_id: string; evaluado_id: string })[]) ?? [];

  const recibidasPor = new Map<string, (typeof evals)[number][]>();
  const enviadasPor = new Map<string, (typeof evals)[number][]>();
  for (const e of evals) {
    const evaluadoId = String(e.evaluado_id);
    const evaluadorId = String(e.evaluador_id);
    recibidasPor.set(evaluadoId, [...(recibidasPor.get(evaluadoId) ?? []), e]);
    enviadasPor.set(evaluadorId, [...(enviadasPor.get(evaluadorId) ?? []), e]);
  }

  const debeEnviar = Math.max(0, dir.length - 1);
  const filas: SeguimientoValorFila[] = dir.map((emp) => {
    const rec = recibidasPor.get(emp.id) ?? [];
    const env = enviadasPor.get(emp.id) ?? [];
    const evaluadosIds = new Set(env.map((e) => String(e.evaluado_id)));
    const faltantes = dir.filter((d) => d.id !== emp.id && !evaluadosIds.has(d.id)).map((d) => ({ id: d.id, nombre: d.nombre }));
    const promedios = promediosPorValor(rec);
    return {
      id: emp.id,
      nombre: emp.nombre,
      recibidas: rec.length,
      enviadas: env.length,
      debeEnviar,
      cumplimiento: debeEnviar > 0 ? Math.round((env.length / debeEnviar) * 100) / 100 : 1,
      promedios,
      nota20: notaValores360(promedios),
      faltantes,
    };
  });

  const totalEmpleados = dir.length;
  const esperadas = totalEmpleados * Math.max(0, totalEmpleados - 1);
  return {
    filas,
    totalEmpleados,
    totalEvaluaciones: evals.length,
    cumplimientoGlobal: esperadas > 0 ? Math.round((evals.length / esperadas) * 100) / 100 : 1,
  };
}

export { VALORES };
