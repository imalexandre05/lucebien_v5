import {
  VALORES,
  promediosPorValor,
  notaValores360,
  puedeEvaluarValores,
  type ValorKey,
  type PuntajeValores,
} from '@scilb/core';
import { getServerClient } from './supabase/server';

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

export type MiResumenValores = {
  recibidas: number;
  promedios: Partial<Record<ValorKey, number>> | null;
  nota20: number | null;
};

// Mi resumen del mes: promedio recibido por valor + nota/20, SIN revelar quién evaluó (el select
// trae evaluador_id pero nunca sale de esta función). Puerto de routes/valores.js:200-219.
export async function miResumenValores(empleadoId: string, mes: string): Promise<MiResumenValores> {
  const sb = getServerClient();
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
  if (!rows.length) return { recibidas: 0, promedios: null, nota20: null };
  const promedios = promediosPorValor(rows);
  return { recibidas: rows.length, promedios, nota20: notaValores360(promedios) };
}

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
