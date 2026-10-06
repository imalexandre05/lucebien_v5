import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  REGLAS_ACCESO_DEFAULT,
  estadoBloqueo,
  leerReglasAcceso,
  registrarFallo,
  validarContrasenaNueva,
  type EstadoIntentos,
  type ReglasAcceso,
  type Sesion,
} from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getAdminClient } from './supabase/admin';

// Exportada (Fase 2): la reutilizan el switcher de sede del topbar (components/shell/sede-
// actions.ts) y el login — antes solo vivía aquí como constante local.
export const SEDE_COOKIE = 'sci_sede';
// Exportado (Fase 1): lo reutilizan crearEmpleado() (empleados-repo.ts) y la reautenticación
// (lib/reauth.ts) — antes solo vivía aquí y se hubiera vuelto a duplicar en cada archivo nuevo.
export const EMAIL_DOMAIN = 'lucebien.local';

// "El dispositivo manda" (Fase 2): fija la sede activa en una cookie httpOnly de sesión. La usan
// el login y el switcher del topbar — un único punto que decide cómo se persiste.
export function fijarSedeActiva(sede: string): void {
  if (!sede) return;
  cookies().set(SEDE_COOKIE, sede, { httpOnly: true, sameSite: 'lax', path: '/' });
}

/**
 * La sede que se eligió al entrar, sólo si es una de las de esa persona.
 *
 * El switcher del topbar valida esto desde la Fase 2 (components/shell/sede-actions.ts), pero el
 * login no: aceptaba cualquiera de las cuatro que pinta la pantalla. No era una fuga —la RLS
 * aguanta, filtra por auth.uid() y no por esta cookie— pero el turno no se podía registrar: crear
 * una solicitud o una incidencia terminaba en un `ERROR 42501` de Postgres, en inglés y sin
 * explicación, y la persona no tenía forma de saber que había elegido mal.
 *
 * Administradores y dueños pueden entrar por cualquier sede que exista; el resto, sólo por las
 * suyas. Si la elegida no vale, se cae a la sede primaria de la persona en lugar de dejar la
 * cookie envenenada.
 */
async function sedeValidaParaEntrar(userId: string, sede: string): Promise<string> {
  const admin = getAdminClient();
  const [{ data: emp }, { data: tiendas }] = await Promise.all([
    admin.from('empleados').select('rol, sede_cod').eq('id', userId).maybeSingle(),
    admin.from('empleado_tiendas').select('sede_cod').eq('empleado_id', userId),
  ]);
  if (!emp) return '';

  const { rol, sede_cod: sedePrimaria } = emp as { rol: string; sede_cod: string | null };
  if (rol === 'admin' || rol === 'dueno') {
    const { data: todas } = await admin.from('sedes').select('cod');
    const existe = (todas ?? []).some((s) => (s as { cod: string }).cod === sede);
    return existe ? sede : (sedePrimaria ?? '');
  }

  const propias = new Set<string>((tiendas ?? []).map((t) => (t as { sede_cod: string }).sede_cod));
  if (sedePrimaria) propias.add(sedePrimaria);
  return propias.has(sede) ? sede : (sedePrimaria ?? '');
}

// ── Login usuario + contraseña ──────────────────────────────────────────────────────────────
// Spec: docs/superpowers/specs/permisos/2026-10-06-login-usuario-contrasena-design.md
//
// El usuario es empleados.nombre; la contraseña es la propia de Supabase Auth. Se conserva el email
// interno {cod}@lucebien.local, pero el código de 4 dígitos YA NO es contraseña: la función login()
// que lo usaba como tal (flag LOGIN_V2 apagado) se eliminó, junto con el flag, el 6-oct-2026 (H0 de la auditoría).
//
// El cliente admin (bypassa RLS) se usa aquí por dos razones, ambas dentro de un archivo que ya
// estaba en la lista permitida del no-negociable 3: (1) la búsqueda del empleado y su contador de
// intentos corren ANTES de que exista sesión; (2) `login_intentos` no tiene policies a propósito —
// si alguien pudiera leer o borrar su contador por la API, el límite no existiría.

export type ResultadoLogin =
  | { ok: true }
  | { ok: false; motivo: 'credenciales' }
  | { ok: false; motivo: 'bloqueado'; minutos: number };

type FilaIntentos = { fallidos: number; bloqueado_hasta: string | null };

/** Reglas de acceso vigentes (config → core). Un fallo de lectura cae a los defaults del core. */
export async function reglasAccesoVigentes(): Promise<ReglasAcceso> {
  const { data, error } = await getAdminClient()
    .from('config')
    .select('clave, valor')
    .in('clave', ['acceso_contrasena_min', 'acceso_intentos_max', 'acceso_bloqueo_min']);
  if (error) {
    console.error('[auth] no se pudieron leer las reglas de acceso; se usan los defaults', error.message);
    return REGLAS_ACCESO_DEFAULT;
  }
  const filas = (data ?? []) as { clave: string; valor: string | null }[];
  return leerReglasAcceso(Object.fromEntries(filas.map((f) => [f.clave, f.valor])));
}

// Fail-open a propósito: si la tabla todavía no existe (ERP desplegado antes que la migración) o
// la lectura falla, el login sigue funcionando como antes — un contador roto nunca deja a todos
// afuera. Se loguea para que se note.
async function leerIntentos(empleadoId: string): Promise<EstadoIntentos> {
  const { data, error } = await getAdminClient()
    .from('login_intentos')
    .select('fallidos, bloqueado_hasta')
    .eq('empleado_id', empleadoId)
    .maybeSingle();
  if (error) {
    console.error('[auth] login_intentos ilegible; el límite de intentos no se aplica', error.message);
    return { fallidos: 0, bloqueadoHasta: null };
  }
  const f = data as FilaIntentos | null;
  return { fallidos: f?.fallidos ?? 0, bloqueadoHasta: f?.bloqueado_hasta ?? null };
}

async function guardarIntentos(empleadoId: string, e: EstadoIntentos): Promise<void> {
  const { error } = await getAdminClient()
    .from('login_intentos')
    .upsert({ empleado_id: empleadoId, fallidos: e.fallidos, bloqueado_hasta: e.bloqueadoHasta, actualizado: new Date().toISOString() });
  if (error) console.error('[auth] no se pudo registrar el intento fallido', error.message);
}

/** Borra el contador de una persona (login correcto o contraseña temporal del admin). */
export async function limpiarIntentos(empleadoId: string): Promise<void> {
  const { error } = await getAdminClient().from('login_intentos').delete().eq('empleado_id', empleadoId);
  if (error) console.error('[auth] no se pudo limpiar el contador de intentos', error.message);
}

/**
 * Verifica una contraseña aplicando el límite de intentos. Mientras la cuenta está bloqueada NO se
 * consulta la contraseña (ni la correcta entra). Si acierta, deja abierta la sesión de Supabase en
 * las cookies de esta respuesta.
 */
async function intentarContrasena(empleado: { id: string; cod: string }, password: string): Promise<ResultadoLogin> {
  const ahora = new Date();
  const estado = await leerIntentos(empleado.id);
  const bloqueo = estadoBloqueo(estado, ahora);
  if (bloqueo.bloqueado) return { ok: false, motivo: 'bloqueado', minutos: bloqueo.minutosRestantes };

  const { error } = await getServerClient().auth.signInWithPassword({
    email: `${empleado.cod}@${EMAIL_DOMAIN}`,
    password,
  });
  if (!error) {
    if (estado.fallidos > 0 || estado.bloqueadoHasta) await limpiarIntentos(empleado.id);
    return { ok: true };
  }

  const nuevo = registrarFallo(estado, ahora, await reglasAccesoVigentes());
  await guardarIntentos(empleado.id, nuevo);
  const ahoraBloqueado = estadoBloqueo(nuevo, ahora);
  if (ahoraBloqueado.bloqueado) return { ok: false, motivo: 'bloqueado', minutos: ahoraBloqueado.minutosRestantes };
  return { ok: false, motivo: 'credenciales' };
}

// `sede` (Fase 2, "el dispositivo manda"): opcional — el login la pre-marca con la sede del
// equipo. No es un campo de seguridad, sólo la sede activa. Un usuario inexistente responde igual
// que una contraseña incorrecta y no cuenta intentos (no hay cuenta que proteger).
export async function loginConUsuario(usuario: string, password: string, sede?: string): Promise<ResultadoLogin> {
  const { data: emp } = await getAdminClient()
    .from('empleados')
    .select('id, cod')
    .ilike('nombre', usuario.trim())
    .maybeSingle();
  if (!emp) return { ok: false, motivo: 'credenciales' };

  const res = await intentarContrasena(emp as { id: string; cod: string }, password);
  if (res.ok && sede) fijarSedeActiva(await sedeValidaParaEntrar((emp as { id: string }).id, sede));
  return res;
}

/**
 * Cambio de contraseña de la persona en sesión (obligatorio en el primer ingreso, o cuando quiera).
 * El id sale de la sesión, nunca del formulario. Verificar la actual cuenta como intento de login.
 * La nueva contraseña y la baja de la marca `debe_cambiar_contrasena` van en UNA llamada a la Admin
 * API: no puede quedar cambiada la contraseña con la marca puesta, ni al revés.
 */
export async function cambiarMiContrasena(
  actual: string,
  nueva: string,
  repetir: string,
): Promise<{ ok: true } | { ok: false; errores: string[] }> {
  const {
    data: { user },
  } = await getServerClient().auth.getUser();
  if (!user) return { ok: false, errores: ['Tu sesión terminó. Vuelve a entrar con tu usuario y contraseña.'] };

  const { data: emp } = await getAdminClient().from('empleados').select('id, cod, nombre').eq('id', user.id).maybeSingle();
  if (!emp) return { ok: false, errores: ['No encontramos tu ficha de personal. Avisa al administrador.'] };
  const persona = emp as { id: string; cod: string; nombre: string };

  if (nueva !== repetir) return { ok: false, errores: ['Las dos contraseñas nuevas no coinciden. Escríbelas otra vez.'] };
  const reglas = await reglasAccesoVigentes();
  const errores = validarContrasenaNueva(nueva, {
    minimo: reglas.contrasenaMin,
    cod: persona.cod,
    nombre: persona.nombre,
    actual,
  });
  if (errores.length) return { ok: false, errores };

  const verificada = await intentarContrasena(persona, actual);
  if (!verificada.ok) {
    return {
      ok: false,
      errores: [
        verificada.motivo === 'bloqueado'
          ? `Demasiados intentos fallidos. Espera ${verificada.minutos} min o pide al administrador una contraseña temporal.`
          : 'La contraseña actual no es correcta. Escribe la que usaste para entrar.',
      ],
    };
  }

  const { error } = await getAdminClient().auth.admin.updateUserById(persona.id, {
    password: nueva,
    app_metadata: { debe_cambiar_contrasena: false },
  });
  if (error) return { ok: false, errores: ['No se pudo guardar la contraseña. Inténtalo de nuevo en un momento.'] };

  // Cambiar la contraseña invalida los refresh tokens viejos: se abre sesión con la nueva para que
  // la persona siga adentro sin volver a escribirla.
  await getServerClient().auth.signInWithPassword({ email: `${persona.cod}@${EMAIL_DOMAIN}`, password: nueva });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const sb = getServerClient();
  await sb.auth.signOut();
  cookies().delete(SEDE_COOKIE);
}

// Sesión actual: lee el usuario de Supabase Auth + su fila de empleados (con la RLS del
// propio usuario: auth.uid() = empleados.id). Devuelve null si no hay sesión.
// cache(): el layout (Topbar) y cada page la piden en el mismo render → una sola resolución.
// Los dos selects (empleado + tiendas) van en paralelo: una ida menos por navegación.
export const getSesion = cache(async (): Promise<Sesion | null> => {
  const sb = getServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [empRes, { data: tiendas }] = await Promise.all([
    sb.from('empleados').select('id, nombre, rol, rol_cod, sede_cod, activo').eq('id', user.id).maybeSingle(),
    sb.from('empleado_tiendas').select('sede_cod').eq('empleado_id', user.id),
  ]);

  let emp = empRes.data as Record<string, unknown> | null;
  if (empRes.error) {
    // Puente defensivo (Fase 1): si la migración 0050 (columna empleados.rol_cod) todavía no se
    // aplicó en este entorno, no tumbar TODA la sesión de TODOS por una columna que falta —
    // reintentar sin rol_cod. Se auto-desactiva solo (deja de entrar aquí) en cuanto la migración
    // corra; no borrar esto antes de confirmar que 0050 está aplicada en producción.
    const { data: fallback } = await sb
      .from('empleados')
      .select('id, nombre, rol, sede_cod, activo')
      .eq('id', user.id)
      .maybeSingle();
    emp = fallback as Record<string, unknown> | null;
  }
  if (!emp) return null;

  // Segunda cerradura de la suspensión: banear al usuario impide entrar de nuevo, pero no mata la
  // sesión que el navegador ya tenía — ese token sigue siendo válido hasta que expire. Para la
  // aplicación, una persona suspendida es igual que una sin sesión.
  // El `!== false` es a propósito: si la columna no viniera (un entorno viejo, o el fallback de
  // arriba), no se echa a nadie por una columna ausente.
  if (emp.activo === false) return null;

  const sedeActiva = cookies().get(SEDE_COOKIE)?.value || (emp.sede_cod as string) || '';
  const lista = (tiendas ?? []).map((t) => t.sede_cod as string);
  return {
    nombre: emp.nombre as string,
    usuario: {
      id: emp.id as string,
      rol: emp.rol as Sesion['usuario']['rol'],
      rolCod: (emp.rol_cod as string | null | undefined) ?? null,
      sede: sedeActiva,
      tiendas: lista.length ? lista : sedeActiva ? [sedeActiva] : [],
    },
  };
});
