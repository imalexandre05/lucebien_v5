import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

export type Pago = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  monto: number;
  bonus: number;
  descuentos: number;
  estado: string;
  metodo: string;
  fechaPago: string | null;
  anulado: boolean;
  createdAt: string;
  // Fase 12 (migración 0057, columnas nuevas): enlace al ciclo evaluación → pago. `null` en pagos
  // históricos (previos a la migración) y en pagos ad-hoc sin evaluación de por medio — ambos
  // casos son válidos, no es un dato faltante por error.
  evaluacionId: string | null;
  notaFinal: number | null;
  montoBase: number | null;
  cicloDesde: string | null;
  cicloHasta: string | null;
  observaciones: string | null;
};

export type EmpleadoPago = {
  id: string;
  nombre: string;
  salarioBase: number;
  ultimaNota: number | null;
};

// "Falta aplicar la migración 0057" (columnas ciclo_desde/ciclo_hasta/monto_base/observaciones en
// pagos) — degradación elegante para la herramienta única de ciclo (lección de la Fase 4/7: avisar
// en vez de reventar con un 500). El registro de pago AD-HOC de siempre (sin estos campos) sigue
// funcionando igual, migración aplicada o no — ver crearPago().
export class PagosCicloNoMigradoError extends Error {
  constructor() {
    super('Falta aplicar la migración 0057 (columnas de ciclo en pagos).');
    this.name = 'PagosCicloNoMigradoError';
  }
}

function esColumnaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' || error.code === '42703' || /could not find the .*column/i.test(error.message ?? '');
}

function fromRow(r: Record<string, unknown>, nombre: string | null): Pago {
  return {
    id: String(r.id),
    empleadoId: String(r.empleado_id),
    empleadoNombre: nombre,
    monto: Number(r.monto ?? 0),
    bonus: Number(r.bonus ?? 0),
    descuentos: Number(r.descuentos ?? 0),
    estado: String(r.estado ?? 'pendiente'),
    metodo: String(r.metodo ?? 'efectivo'),
    fechaPago: (r.fecha_pago as string | null) ?? null,
    anulado: Boolean(r.anulado),
    createdAt: String(r.created_at ?? ''),
    evaluacionId: (r.evaluacion_id as string | null) ?? null,
    notaFinal: r.nota_final != null ? Number(r.nota_final) : null,
    montoBase: r.monto_base != null ? Number(r.monto_base) : null,
    cicloDesde: (r.ciclo_desde as string | null) ?? null,
    cicloHasta: (r.ciclo_hasta as string | null) ?? null,
    observaciones: (r.observaciones as string | null) ?? null,
  };
}

export async function listarPagos(): Promise<Pago[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('pagos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];

  const nombre = await mapaNombres();

  return rows.map((r) => fromRow(r, nombre.get(String(r.empleado_id)) ?? null));
}

// Empleados con su salario base y la última nota (para sugerir el monto = salario×nota/20).
export async function empleadosParaPago(): Promise<EmpleadoPago[]> {
  const sb = getServerClient();
  const { data: emps, error } = await sb.from('empleados').select('id, nombre, salario_base').order('nombre');
  if (error) throw new Error(error.message);

  const { data: evals } = await sb
    .from('evaluaciones_mensuales')
    .select('empleado_id, nota_final, created_at')
    .order('created_at', { ascending: false });
  const ultima = new Map<string, number>();
  for (const e of (evals as { empleado_id: string; nota_final: number }[]) ?? []) {
    if (!ultima.has(e.empleado_id)) ultima.set(e.empleado_id, Number(e.nota_final));
  }

  return ((emps as { id: string; nombre: string; salario_base: number | null }[]) ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    salarioBase: Number(e.salario_base ?? 0),
    ultimaNota: ultima.has(e.id) ? ultima.get(e.id)! : null,
  }));
}

export type CrearPagoInput = {
  empleadoId: string;
  monto: number;
  bonus: number;
  descuentos: number;
  metodo: string;
  estado: string;
  fechaPago: string | null;
  // Fase 12: opcionales — solo la herramienta única de ciclo (/evaluaciones) los manda. El
  // registro ad-hoc de /pagos de siempre no los incluye, así que nunca depende de la migración
  // 0057 para seguir funcionando.
  evaluacionId?: string | null;
  notaFinal?: number | null;
  montoBase?: number | null;
  cicloDesde?: string | null;
  cicloHasta?: string | null;
  observaciones?: string | null;
};

// Devuelve el id del pago creado (la herramienta única de ciclo enlaza al comprobante justo
// después de registrar). Lanza PagosCicloNoMigradoError SOLO si se pidieron campos de ciclo y la
// migración 0057 todavía no corrió — el flujo ad-hoc de siempre nunca entra a esa rama.
export async function crearPago(p: CrearPagoInput): Promise<string> {
  const sb = getServerClient();
  const usaCiclo =
    p.evaluacionId != null || p.cicloDesde != null || p.cicloHasta != null || p.montoBase != null || p.observaciones != null;

  const payload: Record<string, unknown> = {
    empleado_id: p.empleadoId,
    monto: p.monto,
    bonus: p.bonus,
    descuentos: p.descuentos,
    metodo: p.metodo,
    estado: p.estado,
    fecha_pago: p.fechaPago,
  };
  if (p.evaluacionId != null) payload.evaluacion_id = p.evaluacionId;
  if (usaCiclo) {
    payload.monto_base = p.montoBase ?? null;
    payload.ciclo_desde = p.cicloDesde ?? null;
    payload.ciclo_hasta = p.cicloHasta ?? null;
    payload.observaciones = p.observaciones ?? null;
    // nota_final NO es columna de `pagos` (vive en evaluaciones_mensuales, enlazada por
    // evaluacion_id) — se lee vía obtenerPago() con un segundo select, no se duplica al guardar.
  }

  const { data, error } = await sb.from('pagos').insert(payload).select('id').single();
  if (error) {
    if (usaCiclo && esColumnaInexistente(error)) throw new PagosCicloNoMigradoError();
    throw new Error(error.message);
  }
  return String((data as { id: string }).id);
}

export type PagoDetalle = Pago & { empleadoDni: string | null; empleadoRol: string | null };

export async function obtenerPago(id: string): Promise<PagoDetalle | null> {
  const sb = getServerClient();
  const { data, error } = await sb.from('pagos').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const { data: emp } = await sb
    .from('empleados')
    .select('nombre, dni, rol')
    .eq('id', String(r.empleado_id))
    .maybeSingle();
  const e = emp as { nombre: string; dni: string | null; rol: string } | null;

  // nota_final (Fase 12): si el pago está enlazado a una evaluación, se muestra en el comprobante
  // — sale de evaluaciones_mensuales.nota_final, no se duplica en `pagos`.
  let notaFinal: number | null = null;
  if (r.evaluacion_id) {
    const { data: ev } = await sb
      .from('evaluaciones_mensuales')
      .select('nota_final')
      .eq('id', String(r.evaluacion_id))
      .maybeSingle();
    if (ev) notaFinal = Number((ev as { nota_final: number }).nota_final ?? 0);
  }

  return {
    ...fromRow(r, e?.nombre ?? null),
    notaFinal,
    empleadoDni: e?.dni ?? null,
    empleadoRol: e?.rol ?? null,
  };
}

export async function eliminarPago(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('pagos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
