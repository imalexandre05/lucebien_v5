import type { PesosEval } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { leerConfigMap } from './config-repo';

export type Evaluacion = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  mes: string;
  notaFinal: number;
  cicloDesde: string | null;
  cicloHasta: string | null;
  createdAt: string;
};

// Pesos de evaluación desde config (editables). Defaults si falta alguna clave.
export async function leerPesosEval(): Promise<PesosEval> {
  const m = await leerConfigMap();
  const num = (k: string, d: number) => {
    const v = Number(m[k]);
    return Number.isFinite(v) ? v : d;
  };
  return {
    competencias: num('peso_competencias', 0.25),
    valores: num('peso_valores', 0.25),
    operaciones: num('peso_operaciones', 0.1),
    software: num('peso_software', 0.1),
    limpieza: num('peso_limpieza', 0.1),
    examenes: num('peso_examenes', 0.15),
    tardanza: num('peso_tardanza', 0.05),
  };
}

export async function listarEvaluaciones(): Promise<Evaluacion[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('evaluaciones_mensuales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];

  const { data: emps } = await sb.from('empleados').select('id, nombre');
  const nombre = new Map(((emps as { id: string; nombre: string }[]) ?? []).map((e) => [e.id, e.nombre]));

  return rows.map((r) => ({
    id: String(r.id),
    empleadoId: String(r.empleado_id),
    empleadoNombre: nombre.get(String(r.empleado_id)) ?? null,
    mes: String(r.mes ?? ''),
    notaFinal: Number(r.nota_final ?? 0),
    cicloDesde: (r.ciclo_desde as string | null) ?? null,
    cicloHasta: (r.ciclo_hasta as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  }));
}

export async function crearEvaluacion(p: {
  empleadoId: string;
  mes: string;
  notaFinal: number;
  componentes: Record<string, number>;
  pesos: PesosEval;
  cicloDesde: string | null;
  cicloHasta: string | null;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('evaluaciones_mensuales').insert({
    empleado_id: p.empleadoId,
    mes: p.mes,
    nota_final: p.notaFinal,
    componentes: p.componentes,
    pesos_usados: p.pesos,
    ciclo_desde: p.cicloDesde,
    ciclo_hasta: p.cicloHasta,
  });
  if (error) throw new Error(error.message);
}
