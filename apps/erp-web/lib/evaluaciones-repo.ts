import type { PesosEval, EscalaPuntos } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { leerConfigMap } from './config-repo';
import { mapaNombres } from './directorio';

// 'ponderado' (hasta el 24-ago-2026, Σ componente×peso) o 'puntos' (desde la 0095, notaDesdePuntos
// sobre puntosTotal) — spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-
// design.md §2 C-5. Las filas guardadas antes de la 0095 no tienen `metodo` como tal: la migración
// las deja en 'ponderado' por default de columna, así que el valor siempre llega poblado.
export type MetodoEvaluacion = 'ponderado' | 'puntos';

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
  metodo: MetodoEvaluacion;
  puntosTotal: number | null;
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

// Escala puntos → nota (notaDesdePuntos de @scilb/core), desde config. Mismo patrón de lectura
// segura que leerPesosEval: un valor vacío o roto cae al default del catálogo (config-catalogo.ts)
// en vez de colarse como 0 (Number('') es 0 y finito — docs/aprendizajes.md). Ninguno de los 5 está
// confirmado por el administrador: son los ejemplos textuales de la reunión, ver
// docs/pendientes-negocio.md.
export async function leerEscalaPuntos(): Promise<EscalaPuntos> {
  const m = await leerConfigMap();
  const num = (k: string, d: number) => {
    const crudo = m[k];
    if (crudo == null || crudo.trim() === '') return d;
    const v = Number(crudo);
    return Number.isFinite(v) ? v : d;
  };
  return {
    puntosPromedio: num('eval_puntos_promedio', 5000),
    notaPromedio: num('eval_nota_promedio', 16),
    puntosExcelente: num('eval_puntos_excelente', 7500),
    bandaRiesgo: num('eval_banda_riesgo', 13),
    bandaIdeal: num('eval_banda_ideal', 18),
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
    // `select('*')` a propósito (mismo criterio de esta función): si la 0095 todavía no corrió,
    // `r.metodo` viene undefined y cae al default seguro 'ponderado' — la fila es de antes de que
    // el método existiera, así que es exactamente lo que habría guardado la migración.
    metodo: (r.metodo as MetodoEvaluacion | undefined) ?? 'ponderado',
    puntosTotal: r.puntos_total == null ? null : Number(r.puntos_total),
  }));
}

// Componentes auto-calculados desde la data (reportes evaluados/del equipo, asistencias,
// incidencias, pipeline, extras, ventas) para un rango. Devuelve el jsonb tal cual lo arma
// private.evaluacion_componentes_datos — ver esa función (packages/db/migrations/
// 0095_puntos_como_moneda.sql) para el significado exacto de cada clave. `ventasSinTasa` es el
// único campo booleano; el resto son numéricos (o null para 'valores' sin datos ese mes).
export type ComponentesRPC = {
  operaciones: number;
  software: number;
  limpieza: number;
  tardanza: number;
  descuento: number;
  puntosPipeline: number;
  extrasMonto: number;
  extrasCantidad: number;
  extrasPuntos: number;
  valores: number | null;
  valoresCantidad: number;
  bonusVentas: number;
  // 🆕 spec 2026-08-25-puntos-como-moneda-design.md — desglose de puntos (migración 0095). Quedan
  // `undefined` (no `0`) si esa migración todavía no corrió: notaDesdePuntos() los rechaza con un
  // mensaje claro en vez de calcular con un 0 que no es real (mismo principio que ya sigue
  // calcularNotaMensual con datos rotos).
  puntosActividades?: number;
  puntosVentas?: number;
  ventasSinTasa?: boolean;
  puntosTotal?: number;
};

export async function componentesEvaluacion(empleadoId: string, desde: string, hasta: string): Promise<ComponentesRPC> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('evaluacion_componentes', {
    p_empleado: empleadoId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(error.message);
  return (data as ComponentesRPC) ?? ({} as ComponentesRPC);
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
//
// `metodo`/`puntosTotal` (0095, spec puntos-como-moneda §2 C-5): quien llama decide el método —
// desde el 25-ago-2026 la pantalla siempre guarda 'puntos' para evaluaciones nuevas, pero el
// parámetro queda explícito (no hardcodeado acá) para que este repo no sea el que decide la regla
// de negocio. Con 'ponderado' (compatibilidad, no usado hoy por la pantalla), `puntosTotal` debe
// venir null: es justo lo que la columna espera para una evaluación que no vino de puntos.
export async function crearEvaluacion(p: {
  empleadoId: string;
  mes: string;
  notaFinal: number;
  componentes: Record<string, number>;
  pesos: PesosEval;
  cicloDesde: string | null;
  cicloHasta: string | null;
  metodo: MetodoEvaluacion;
  puntosTotal: number | null;
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
      metodo: p.metodo,
      puntos_total: p.puntosTotal,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}
