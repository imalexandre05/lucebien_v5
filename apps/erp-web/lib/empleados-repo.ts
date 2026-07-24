import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';

// Gestión de colaboradores (solo admin). La RLS ya lo garantiza:
//  · emp_select     → app_es_admin() OR id = auth.uid()  (admin ve todos)
//  · emp_admin_write→ app_es_admin()                     (admin escribe)
// NUNCA se selecciona `cod` (es la credencial de login) ni `password_hash`.
export type EmpleadoAdmin = {
  id: string;
  nombre: string;
  iniciales: string | null;
  rol: string;
  sedeCod: string | null;
  activo: boolean;
  estado: string | null;
  telefono: string | null;
  dni: string | null;
  direccion: string | null;
  fechaIngreso: string | null;
  salarioBase: number;
  notas: string | null;
  tiendas: string[];
};

const COLS =
  'id, nombre, iniciales, rol, sede_cod, activo, estado, telefono, dni, direccion, fecha_ingreso, salario_base, notas';

type Row = Record<string, unknown>;

function fromRow(r: Row, tiendas: string[]): EmpleadoAdmin {
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    iniciales: (r.iniciales as string | null) ?? null,
    rol: String(r.rol ?? ''),
    sedeCod: (r.sede_cod as string | null) ?? null,
    activo: Boolean(r.activo),
    estado: (r.estado as string | null) ?? null,
    telefono: (r.telefono as string | null) ?? null,
    dni: (r.dni as string | null) ?? null,
    direccion: (r.direccion as string | null) ?? null,
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    salarioBase: Number(r.salario_base ?? 0),
    notas: (r.notas as string | null) ?? null,
    tiendas,
  };
}

export async function listarEmpleadosAdmin(): Promise<EmpleadoAdmin[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('empleados').select(COLS).order('nombre', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data as Row[]) ?? [];

  const tiendasByEmp = new Map<string, string[]>();
  if (rows.length) {
    const ids = rows.map((r) => String(r.id));
    const { data: t, error: e2 } = await sb
      .from('empleado_tiendas')
      .select('empleado_id, sede_cod')
      .in('empleado_id', ids);
    if (e2) throw new Error(e2.message);
    for (const row of (t as { empleado_id: string; sede_cod: string }[]) ?? []) {
      const arr = tiendasByEmp.get(row.empleado_id) ?? [];
      arr.push(row.sede_cod);
      tiendasByEmp.set(row.empleado_id, arr);
    }
  }

  return rows.map((r) => fromRow(r, (tiendasByEmp.get(String(r.id)) ?? []).sort()));
}

// Suspender / reactivar (sin cascada de nombre: no toca el nombre). RLS exige admin.
export async function actualizarEstadoEmpleado(id: string, activo: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('empleados')
    .update({ activo, estado: activo ? 'activo' : 'suspendido' })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Asignar/reiniciar la contraseña de login (LOGIN_V2). Usa el cliente admin — cambiar la
// contraseña de OTRO usuario en Supabase Auth requiere la Admin API (service_role), no está
// expuesto por PostgREST/RLS normal. updateUserById hashea server-side; nunca pasa por una
// tabla propia ni se loguea en texto plano.
export async function establecerContrasenaEmpleado(id: string, password: string): Promise<void> {
  const { error } = await getAdminClient().auth.admin.updateUserById(id, { password });
  if (error) throw new Error(error.message);
}

// Editar datos de contacto (NO el nombre/cod/rol: esos tienen implicaciones de
// pseudo-FK por nombre y de credenciales). RLS exige admin.
export async function actualizarContactoEmpleado(
  id: string,
  p: { telefono: string; dni: string; direccion: string; salarioBase: number },
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('empleados')
    .update({
      telefono: p.telefono,
      dni: p.dni,
      direccion: p.direccion,
      salario_base: p.salarioBase,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
