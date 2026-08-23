import type { Rol } from '@scilb/core';
import { generarIniciales, elegirCodigoLibre } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';
import { EMAIL_DOMAIN } from './auth';

// Gestión de colaboradores (solo admin). La RLS ya lo garantiza:
//  · emp_select     → app_es_admin() OR id = auth.uid()  (admin ve todos)
//  · emp_admin_write→ app_es_admin()                     (admin escribe)
// NUNCA se selecciona `cod` (es la credencial de login) ni `password_hash`.
export type EmpleadoAdmin = {
  id: string;
  nombre: string;
  iniciales: string | null;
  rol: string;
  rolCod: string | null;
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
  'id, nombre, iniciales, rol, rol_cod, sede_cod, activo, estado, telefono, dni, direccion, fecha_ingreso, salario_base, notas';

type Row = Record<string, unknown>;

function fromRow(r: Row, tiendas: string[]): EmpleadoAdmin {
  return {
    id: String(r.id),
    nombre: String(r.nombre ?? ''),
    iniciales: (r.iniciales as string | null) ?? null,
    rol: String(r.rol ?? ''),
    rolCod: (r.rol_cod as string | null) ?? null,
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

// Editar TODO el empleado (Fase 1): nombre, rol (base o derivado), sede primaria, tiendas, fecha
// de ingreso, notas + los datos de contacto que ya existían. `cod` NUNCA se toca aquí — es la
// credencial de Supabase Auth (email interno {cod}@lucebien.local), inmutable por diseño.
//
// Va a la RPC empleado_actualizar (migración 0050) porque toca 2 tablas (empleados +
// empleado_tiendas) y necesita quedar atómico. La cascada de 7 pseudo-FK por nombre TEXT que
// describe CLAUDE.md YA NO aplica en este schema Postgres: reportes/incidencias/pipeline_puntos/
// prenda_historial/reporte_trabajadores/reporte_extras enlazan por `empleado_id uuid` (ver
// 0001_init.sql), no por nombre — renombrar no requiere propagar nada, solo la RPC valida
// unicidad case-insensitive (el login por usuario busca `ilike nombre`).
// `salarioBase` sigue siendo obligatorio a propósito, aunque desde R3/T7 ningún formulario lo
// edita (el sueldo real lo paga el contrato — ver ContactoCampos en app/empleados/cliente.tsx).
// La RPC empleado_actualizar recibe p_salario_base como parámetro NOT NULL con
// `coalesce(p_salario_base, 0)`: omitirlo o mandar null pondría la columna en 0. Todo llamador
// tiene que mandar el valor YA guardado de la persona, sin pasar por ningún input, para que el
// resto de la edición no lo altere.
export type EditarEmpleadoInput = {
  nombre: string;
  rolBase: Rol;
  rolCod: string | null;
  sedeCod: string;
  tiendas: string[];
  fechaIngreso: string | null;
  notas: string;
  telefono: string;
  dni: string;
  direccion: string;
  salarioBase: number;
};

export async function actualizarEmpleado(id: string, p: EditarEmpleadoInput): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('empleado_actualizar', {
    p_id: id,
    p_nombre: p.nombre,
    p_rol_base: p.rolBase,
    p_rol_cod: p.rolCod,
    p_sede_cod: p.sedeCod,
    p_tiendas: p.tiendas,
    p_fecha_ingreso: p.fechaIngreso,
    p_notas: p.notas,
    p_telefono: p.telefono,
    p_dni: p.dni,
    p_direccion: p.direccion,
    p_salario_base: p.salarioBase,
  });
  if (error) throw new Error(error.message);
}

// Crear un colaborador nuevo (Fase 1): provisiona el usuario de Supabase Auth (email interno
// {cod}@lucebien.local, cod de 4 dígitos libre elegido server-side) y su fila en `empleados` +
// `empleado_tiendas`. Usa el cliente ADMIN (service_role) porque auth.admin.createUser es una
// operación de administración de GoTrue, no pasa por PostgREST/RLS normal.
//
// No es una transacción real entre Auth y Postgres (son dos sistemas distintos), así que
// compensa: si el insert en `empleados` falla DESPUÉS de crear el usuario de Auth, borra ese
// usuario para no dejarlo huérfano (existiría en Auth pero invisible/inmanejable en la app).
export type NuevoEmpleadoInput = {
  nombre: string;
  rolBase: Rol;
  rolCod: string | null;
  sedeCod: string;
  tiendas: string[];
  fechaIngreso: string | null;
  notas: string;
  password: string;
};

export async function crearEmpleado(p: NuevoEmpleadoInput): Promise<{ id: string; cod: string }> {
  const admin = getAdminClient();
  const nombre = p.nombre.trim();
  if (!nombre) throw new Error('El nombre es obligatorio');
  if (p.password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres');

  // Unicidad case-insensitive (el login por usuario depende de esto — ver nota arriba).
  const { data: dup, error: eDup } = await admin
    .from('empleados')
    .select('id')
    .ilike('nombre', nombre)
    .maybeSingle();
  if (eDup) throw new Error(eDup.message);
  if (dup) throw new Error('Ya existe un colaborador con ese nombre');

  const { data: existentes, error: eCods } = await admin.from('empleados').select('cod');
  if (eCods) throw new Error(eCods.message);
  const cod = elegirCodigoLibre((existentes ?? []).map((e) => String((e as { cod: string }).cod)));

  const { data: authData, error: eAuth } = await admin.auth.admin.createUser({
    email: `${cod}@${EMAIL_DOMAIN}`,
    password: p.password,
    email_confirm: true,
  });
  if (eAuth || !authData?.user) throw new Error(eAuth?.message ?? 'No se pudo crear el usuario de acceso');

  const id = authData.user.id;
  try {
    const { error: eIns } = await admin.from('empleados').insert({
      id,
      cod,
      nombre,
      iniciales: generarIniciales(nombre),
      rol: p.rolBase,
      rol_cod: p.rolCod,
      sede_cod: p.sedeCod,
      activo: true,
      estado: 'activo',
      fecha_ingreso: p.fechaIngreso || null,
      notas: p.notas ?? '',
    });
    if (eIns) throw new Error(eIns.message);

    const tiendas = Array.from(new Set([p.sedeCod, ...p.tiendas].filter(Boolean)));
    if (tiendas.length) {
      const { error: eTiendas } = await admin
        .from('empleado_tiendas')
        .insert(tiendas.map((sede_cod) => ({ empleado_id: id, sede_cod })));
      if (eTiendas) throw new Error(eTiendas.message);
    }
  } catch (e) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
    throw e;
  }

  return { id, cod };
}
