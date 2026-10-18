import type { Rol } from '@scilb/core';
import { generarIniciales, elegirCodigoLibre, codigosDeEmails, generarContrasenaTemporal, validarContrasenaNueva } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';
import { EMAIL_DOMAIN, limpiarIntentos, reglasAccesoVigentes, revocarSesiones } from './auth';

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
  /** C-2: referencias/recomendaciones en texto libre, sin fuente automática. */
  recomendaciones: string | null;
  tiendas: string[];
};

const COLS =
  'id, nombre, iniciales, rol, rol_cod, sede_cod, activo, estado, telefono, dni, direccion, fecha_ingreso, salario_base, notas, recomendaciones';

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
    recomendaciones: (r.recomendaciones as string | null) ?? null,
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
//
// LA COLUMNA SOLA NO CERRABA NADA. Hasta el 23-ago-2026 esto escribía `activo` y `estado` y ahí
// terminaba: ni el login, ni la sesión, ni el middleware, ni los helpers de RLS miraban esa
// columna, y `banned_until` quedaba en null en Supabase Auth. Quien era suspendido entraba esa
// misma tarde con su usuario de siempre, enviaba reportes que sumaban puntos y consultaba su
// liquidación. El diálogo de la ficha, mientras tanto, le prometía al administrador que la persona
// "deja de poder entrar al sistema".
//
// Ahora hay tres cerraduras, cada una suficiente por sí sola (spec
// docs/superpowers/specs/permisos/2026-08-23-suspender-cierra-la-puerta-design.md):
//   1. acá: se banea al usuario en Supabase Auth, con el mismo cliente admin que ya se usa abajo
//      para la contraseña;
//   2. getSesion() devuelve null si la persona no está activa, para cortar la sesión que ya
//      estuviera abierta (el token sigue siendo válido hasta que expire);
//   3. los helpers de RLS exigen `activo` (migración 0083), por si alguien escribe la columna a
//      mano sin pasar por esta pantalla.
export async function actualizarEstadoEmpleado(id: string, activo: boolean, hoy: string): Promise<void> {
  // No se puede suspender al último administrador activo: nadie podría volver a reactivarlo desde
  // la aplicación y la empresa quedaría afuera de su propio sistema.
  if (!activo) {
    const { data: admins, error: eAdm } = await getAdminClient()
      .from('empleados')
      .select('id')
      .in('rol', ['admin', 'dueno'])
      .eq('activo', true);
    if (eAdm) throw new Error(eAdm.message);
    const quedan = (admins ?? []).filter((a) => String((a as { id: string }).id) !== id);
    const esAdmin = (admins ?? []).some((a) => String((a as { id: string }).id) === id);
    if (esAdmin && quedan.length === 0) {
      throw new Error(
        'No se puede suspender al último administrador activo. Nombra a otro administrador antes de suspender a este.',
      );
    }
  }

  // SUSPENDER (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §2.1). Primero se
  // cierra la puerta de calle y después se llama a la RPC, que en UNA transacción marca la ficha y
  // cierra el contrato vigente con la fecha `hoy` (hoyPeru() de quien invoca). Si la RPC falla —por
  // ejemplo, una liquidación que llega más allá de la baja— se quita el baneo y no cambia nada: el
  // orden inverso dejaba el contrato cerrado y el acceso vivo si el baneo fallaba.
  if (!activo) {
    const { error: eBan } = await getAdminClient().auth.admin.updateUserById(id, { ban_duration: '876000h' });
    if (eBan) {
      throw new Error(`No se pudo suspender el acceso de esta persona: ${eBan.message}. No se cambió nada.`);
    }
    const { error } = await getServerClient().rpc('empleado_suspender', { p_id: id, p_hoy: hoy });
    if (error) {
      const { error: eDesban } = await getAdminClient().auth.admin.updateUserById(id, { ban_duration: 'none' });
      if (eDesban) {
        throw new Error(
          `${error.message.replace(/^[A-Z_]+:/, '')} Además, no se pudo devolver el acceso a esta persona (${eDesban.message}): reactívala desde su ficha.`,
        );
      }
      // Los mensajes de la RPC llevan un prefijo de código («ESTADO:», «DATO:»…) para la capa de
      // sueldos; a la pantalla sólo le sirve el texto.
      throw new Error(error.message.replace(/^[A-Z_]+:/, ''));
    }
    return;
  }

  // REACTIVAR. No reabre el contrato (spec §2.1): quien vuelve necesita uno nuevo.
  const sb = getServerClient();
  const { error } = await sb.from('empleados').update({ activo: true, estado: 'activo' }).eq('id', id);
  if (error) throw new Error(error.message);

  // Si el desbaneo falla, se deshace la escritura de arriba: una ficha que dice "activo" con el
  // acceso todavía cerrado es peor que no haber hecho nada.
  const { error: eBan } = await getAdminClient().auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (eBan) {
    await sb.from('empleados').update({ activo: false, estado: 'suspendido' }).eq('id', id);
    throw new Error(`No se pudo reactivar el acceso de esta persona: ${eBan.message}. No se cambió nada.`);
  }
}

// Contraseña temporal (spec permisos/2026-10-06-login-usuario-contrasena §6). La genera el
// servidor —el admin no elige «1234»—, se devuelve UNA vez para que la entregue en persona y no se
// guarda ni se loguea. En una sola llamada a la Admin API (service_role: cambiar la contraseña de
// OTRA cuenta no pasa por PostgREST/RLS) fija la contraseña y la marca de cambio obligatorio; después
// cierra todas sus sesiones y borra el contador de intentos (también desbloquea la cuenta).
export async function generarContrasenaTemporalEmpleado(id: string): Promise<string> {
  const temporal = generarContrasenaTemporal((n) => crypto.getRandomValues(new Uint8Array(n)));
  const { error } = await getAdminClient().auth.admin.updateUserById(id, {
    password: temporal,
    app_metadata: { debe_cambiar_contrasena: true },
  });
  if (error) throw new Error('No se pudo cambiar la contraseña. Inténtalo de nuevo en un momento.');
  // Si la cuenta estaba comprometida, quien la tenía abierta queda afuera ahora, no cuando venza su token.
  await revocarSesiones(id);
  await limpiarIntentos(id);
  return temporal;
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
  /** C-2: RPC aparte (empleado_actualizar_recomendaciones) — ver actualizarEmpleado() abajo. No
      forma parte de los parámetros de empleado_actualizar (0050): agregarle uno con `create or
      replace` no la reemplaza, crea una sobrecarga ambigua porque cambia la firma completa. */
  recomendaciones: string;
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

  const { error: errorRecom } = await sb.rpc('empleado_actualizar_recomendaciones', {
    p_id: id,
    p_texto: p.recomendaciones,
  });
  if (errorRecom) throw new Error(errorRecom.message);
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

// Deshacer un alta de personal hecha por error (docs/superpowers/specs/empleados/
// 2026-08-25-borrar-alta-por-error-design.md, migración 0099). NO reimplementa nada acá: las dos
// funciones sólo llaman a las RPC `empleado_borrar_alta_previo`/`empleado_borrar_alta`, que ya
// llevan adentro el guard de admin y toda la lógica de qué bloquea y qué se borra o se vacía —
// tocarla es zona crítica y ya está aplicada y probada contra `scilb` (17 casos).
//
// `empleado_borrar_alta_previo` es SOLO LECTURA (C-1): alimenta el diálogo con lo que se perdería
// ANTES de confirmar. `bloqueos` vacío es la señal de que se puede borrar; `conteos` ya viene
// filtrado por la RPC a lo que efectivamente se borraría o se vaciaría para ESTA persona (nunca
// un total de tabla) — la pantalla sólo tiene que mostrar las claves con valor > 0.
export type BorrarAltaPrevio = {
  bloqueos: string[];
  conteos: Record<string, number>;
};

export async function empleadoBorrarAltaPrevio(id: string): Promise<BorrarAltaPrevio> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('empleado_borrar_alta_previo', { p_empleado: id });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { bloqueos?: unknown; conteos?: unknown };
  return {
    bloqueos: Array.isArray(r.bloqueos) ? r.bloqueos.map((b) => String(b)) : [],
    conteos: (r.conteos as Record<string, number> | undefined) ?? {},
  };
}

// Borra. Irreversible — la RPC vuelve a comprobar los bloqueos y el guard de admin ella misma, no
// confía en que la pantalla haya llamado a empleadoBorrarAltaPrevio() antes. El registro en
// audit_log lo escribe el trigger existente (trg_audit_empleados, 0058) al hacer el delete, no hay
// nada que escribir a mano acá.
//
// Después de la RPC se borra también el usuario de Supabase Auth: si no, queda un usuario vivo sin
// ficha (y su código de login seguiría ocupado). Auth y Postgres no comparten transacción, así que
// si ese borrado falla el alta YA está deshecha y no se puede revertir: no se lanza error, se
// devuelve `avisoAuth` para que la pantalla se lo diga al administrador.
export async function empleadoBorrarAlta(id: string): Promise<{ avisoAuth?: string }> {
  const sb = getServerClient();
  const { error } = await sb.rpc('empleado_borrar_alta', { p_empleado: id });
  if (error) throw new Error(error.message);

  const { error: eAuth } = await getAdminClient().auth.admin.deleteUser(id);
  // 404 / "not found": el usuario ya no existía, que es el estado buscado.
  if (eAuth && eAuth.status !== 404 && !/not.?found/i.test(eAuth.message)) {
    return {
      avisoAuth: `El alta se deshizo, pero no se pudo borrar el usuario de acceso (${eAuth.message}). Bórralo a mano en Supabase Auth: mientras exista, su código de login sigue ocupado.`,
    };
  }
  return {};
}

// Códigos de login que ya usa algún usuario de Auth (email `{cod}@EMAIL_DOMAIN`), exista o no su
// ficha en `empleados`. Recorre todas las páginas de listUsers.
async function codigosEnAuth(): Promise<string[]> {
  const admin = getAdminClient();
  const emails: string[] = [];
  const porPagina = 1000;
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: porPagina });
    if (error) throw new Error(error.message);
    const usuarios = data?.users ?? [];
    for (const u of usuarios) emails.push(u.email ?? '');
    if (usuarios.length < porPagina) break;
  }
  return codigosDeEmails(emails, EMAIL_DOMAIN);
}

export async function crearEmpleado(p: NuevoEmpleadoInput): Promise<{ id: string; cod: string }> {
  const admin = getAdminClient();
  const nombre = p.nombre.trim();
  if (!nombre) throw new Error('El nombre es obligatorio');
  // La contraseña inicial es temporal (nace con la marca de cambio obligatorio), pero igual cumple
  // las reglas: se entrega en papel y es la puerta de la cuenta hasta el primer ingreso.
  const { contrasenaMin } = await reglasAccesoVigentes();
  const problemas = validarContrasenaNueva(p.password, { minimo: contrasenaMin, nombre });
  if (problemas.length) throw new Error(`Contraseña inicial: ${problemas.join(' ')}`);

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
  const cod = elegirCodigoLibre([
    ...(existentes ?? []).map((e) => String((e as { cod: string }).cod)),
    ...(await codigosEnAuth()),
  ]);
  // El código recién elegido tampoco puede ir dentro de la contraseña (§4). Rarísimo, pero el admin
  // no lo ve y no podría saber por qué la persona queda con una contraseña débil.
  if (p.password.includes(cod)) throw new Error('Contraseña inicial: elige otra; esa coincide con el código interno de la persona.');

  const { data: authData, error: eAuth } = await admin.auth.admin.createUser({
    email: `${cod}@${EMAIL_DOMAIN}`,
    password: p.password,
    email_confirm: true,
    app_metadata: { debe_cambiar_contrasena: true },
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
