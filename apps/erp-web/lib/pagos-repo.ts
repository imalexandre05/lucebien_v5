import { getServerClient } from './supabase/server';

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
};

export type EmpleadoPago = {
  id: string;
  nombre: string;
  salarioBase: number;
  ultimaNota: number | null;
};

export async function listarPagos(): Promise<Pago[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('pagos')
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
    monto: Number(r.monto ?? 0),
    bonus: Number(r.bonus ?? 0),
    descuentos: Number(r.descuentos ?? 0),
    estado: String(r.estado ?? 'pendiente'),
    metodo: String(r.metodo ?? 'efectivo'),
    fechaPago: (r.fecha_pago as string | null) ?? null,
    anulado: Boolean(r.anulado),
    createdAt: String(r.created_at ?? ''),
  }));
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

export async function crearPago(p: {
  empleadoId: string;
  monto: number;
  bonus: number;
  descuentos: number;
  metodo: string;
  estado: string;
  fechaPago: string | null;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('pagos').insert({
    empleado_id: p.empleadoId,
    monto: p.monto,
    bonus: p.bonus,
    descuentos: p.descuentos,
    metodo: p.metodo,
    estado: p.estado,
    fecha_pago: p.fechaPago,
  });
  if (error) throw new Error(error.message);
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
  return {
    id: String(r.id),
    empleadoId: String(r.empleado_id),
    empleadoNombre: e?.nombre ?? null,
    monto: Number(r.monto ?? 0),
    bonus: Number(r.bonus ?? 0),
    descuentos: Number(r.descuentos ?? 0),
    estado: String(r.estado ?? 'pendiente'),
    metodo: String(r.metodo ?? 'efectivo'),
    fechaPago: (r.fecha_pago as string | null) ?? null,
    anulado: Boolean(r.anulado),
    createdAt: String(r.created_at ?? ''),
    empleadoDni: e?.dni ?? null,
    empleadoRol: e?.rol ?? null,
  };
}

export async function eliminarPago(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('pagos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
