import { getServerClient } from './supabase/server';

export type Asistencia = {
  id: string;
  empleadoId: string;
  empleadoNombre: string | null;
  fecha: string;
  turno: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  minutosTardanza: number;
  fuente: string;
  obs: string | null;
};

type Row = {
  id: string;
  empleado_id: string;
  fecha: string;
  turno: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  minutos_tardanza: number | null;
  fuente: string;
  obs: string | null;
};

export async function listarAsistencias(): Promise<Asistencia[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('asistencias')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];

  const { data: emps } = await sb.from('empleados').select('id, nombre');
  const nombre = new Map(((emps as { id: string; nombre: string }[]) ?? []).map((e) => [e.id, e.nombre]));

  return rows.map((r) => ({
    id: r.id,
    empleadoId: r.empleado_id,
    empleadoNombre: nombre.get(r.empleado_id) ?? null,
    fecha: (r.fecha ?? '').slice(0, 10),
    turno: r.turno,
    horaEntrada: r.hora_entrada,
    horaSalida: r.hora_salida,
    minutosTardanza: Number(r.minutos_tardanza ?? 0),
    fuente: r.fuente,
    obs: r.obs,
  }));
}

export async function crearAsistencia(p: {
  empleadoId: string;
  fecha: string;
  turno: string;
  horaEntrada: string | null;
  horaSalida: string | null;
  minutosTardanza: number;
  obs: string;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('asistencias').upsert(
    {
      empleado_id: p.empleadoId,
      fecha: p.fecha,
      turno: p.turno,
      hora_entrada: p.horaEntrada || null,
      hora_salida: p.horaSalida || null,
      minutos_tardanza: p.minutosTardanza,
      fuente: 'manual',
      obs: p.obs || null,
    },
    { onConflict: 'empleado_id,fecha,turno' },
  );
  if (error) throw new Error(error.message);
}

export async function eliminarAsistencia(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('asistencias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
