import type { PesosEval } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { leerConfigMap } from './config-repo';
import { mapaNombres } from './directorio';

export type Evaluacion = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  mes: string;
  notaFinal: number;
  // Snapshot guardado al evaluar (jsonb): desglose /20 por componente y pesos usados.
  componentes: Record<string, number> | null;
  pesosUsados: Record<string, number> | null;
  cicloDesde: string | null;
  cicloHasta: string | null;
  createdAt: string;
};

// Pesos de evaluación desde config (editables). Defaults si falta alguna clave.
export async function leerPesosEval(): Promise<PesosEval> {
  const m = await leerConfigMap();
  // Se comprueba el vacío ANTES de convertir. `leerConfigMap()` normaliza un valor nulo a cadena
  // vacía, y `Number('')` es 0 y es finito: sin este chequeo, un peso que el administrador borró
  // en /configuracion entraba a la nota como 0 en vez de volver al default, y el componente
  // desaparecía del cálculo /20 sin que nada avisara. Mismo patrón que ya usan las pantallas de
  // asistencia del sueldo (app/sueldos/asistencia/page.tsx).
  const num = (k: string, d: number) => {
    const crudo = m[k];
    if (crudo == null || crudo.trim() === '') return d;
    const v = Number(crudo);
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

  const nombre = await mapaNombres();

  return rows.map((r) => ({
    id: String(r.id),
    empleadoId: String(r.empleado_id),
    empleadoNombre: nombre.get(String(r.empleado_id)) ?? null,
    mes: String(r.mes ?? ''),
    notaFinal: Number(r.nota_final ?? 0),
    componentes: (r.componentes as Record<string, number> | null) ?? null,
    pesosUsados: (r.pesos_usados as Record<string, number> | null) ?? null,
    cicloDesde: (r.ciclo_desde as string | null) ?? null,
    cicloHasta: (r.ciclo_hasta as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  }));
}

// Componentes auto-calculados desde la data (reportes evaluados como encargado, asistencias,
// incidencias) para un rango. Devuelve { operaciones, software, limpieza, tardanza, descuento }.
export async function componentesEvaluacion(
  empleadoId: string,
  desde: string,
  hasta: string,
): Promise<Record<string, number>> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('evaluacion_componentes', {
    p_empleado: empleadoId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(error.message);
  return (data as Record<string, number>) ?? {};
}

// Empleados con fecha de ingreso + salario base (Fase 12): la herramienta única de ciclo
// (/evaluaciones) los necesita para calcularCiclo() (aniversario) y sugerirMontoPago(). RLS
// (emp_select: admin O id=auth.uid()) ya limita esto a lo que el propio esAdmin gate de la
// página permite ver — un no-admin que llegue a llamarla solo se ve a sí mismo, sin fuga de datos.
export type EmpleadoParaEvaluacion = { id: string; nombre: string; fechaIngreso: string | null; salarioBase: number };

export async function empleadosParaEvaluacion(): Promise<EmpleadoParaEvaluacion[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleados')
    .select('id, nombre, fecha_ingreso, salario_base')
    .eq('activo', true)
    .order('nombre');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    salarioBase: Number(r.salario_base ?? 0),
  }));
}

// Catálogo editable de las 8 competencias con rúbrica (Fase 12 tarea 2, migración 0057,
// competencias_config) — reemplaza la constante COMPETENCIAS hardcodeada de public/js/data.js
// del sistema viejo. select('*') a propósito (lección de la Fase 4): si 0057 no corrió todavía,
// Postgres devuelve "relation does not exist" de todos modos (es tabla nueva, no columna nueva en
// tabla existente) — ver accionListarCompetencias en actions.ts para el aviso "falta migrar".
export type CompetenciaConfig = { cod: string; nombre: string; orden: number; rubrica: string[] };

export async function listarCompetenciasConfig(): Promise<CompetenciaConfig[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('competencias_config')
    .select('*')
    .eq('activo', true)
    .order('orden');
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    cod: String(r.cod ?? ''),
    nombre: String(r.nombre ?? ''),
    orden: Number(r.orden ?? 0),
    rubrica: Array.isArray(r.rubrica) ? (r.rubrica as string[]) : [],
  }));
}

// Devuelve el id (Fase 12): la herramienta única de ciclo lo necesita para enlazar el pago que
// se registra justo después (pagos.evaluacion_id) sin una segunda consulta.
export async function crearEvaluacion(p: {
  empleadoId: string;
  mes: string;
  notaFinal: number;
  componentes: Record<string, number>;
  pesos: PesosEval;
  cicloDesde: string | null;
  cicloHasta: string | null;
}): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('evaluaciones_mensuales')
    .insert({
      empleado_id: p.empleadoId,
      mes: p.mes,
      nota_final: p.notaFinal,
      componentes: p.componentes,
      pesos_usados: p.pesos,
      ciclo_desde: p.cicloDesde,
      ciclo_hasta: p.cicloHasta,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}
