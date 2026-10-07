import { getServerClient } from './supabase/server';
import { getAdminClient, adminConfigurado } from './supabase/admin';

// Acceso restringido a equipos autorizados (migración 0036). El token del equipo vive en la
// cookie httpOnly `sci_device`; el estado se resuelve por RPC SECURITY DEFINER.
export type EstadoDispositivo = 'setup' | 'aprobado' | 'pendiente' | 'rechazado' | 'revocado' | 'none';

export type Dispositivo = {
  id: string;
  deviceId: string;
  nombre: string | null;
  sedeCod: string | null;
  userAgent: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'revocado';
  // Equipo compartido (migración 0112): el pipeline pide el código personal de quien opera.
  compartido: boolean;
  creadoEn: string;
  aprobadoEn: string | null;
  ultimoVisto: string;
};

export async function estadoDispositivo(deviceId: string): Promise<EstadoDispositivo> {
  if (!deviceId) return 'none';
  const sb = getServerClient();
  const { data, error } = await sb.rpc('dispositivo_estado', { p_device_id: deviceId });
  if (error) throw error;
  return (data as EstadoDispositivo) ?? 'none';
}

export async function registrarDispositivo(
  deviceId: string,
  nombre: string,
  userAgent: string,
  sede: string,
): Promise<EstadoDispositivo> {
  if (!deviceId) return 'none';
  const sb = getServerClient();
  const { data, error } = await sb.rpc('dispositivo_registrar', {
    p_device_id: deviceId,
    p_nombre: nombre,
    p_user_agent: userAgent,
    p_sede: sede,
  });
  if (error) throw error;
  return (data as EstadoDispositivo) ?? 'none';
}

// Solo admin (RLS disp_admin_rw): un no-admin recibe lista vacía.
export async function listarDispositivos(): Promise<Dispositivo[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('dispositivos_autorizados')
    .select('id, device_id, nombre, sede_cod, user_agent, estado, compartido, creado_en, aprobado_en, ultimo_visto')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    deviceId: d.device_id as string,
    nombre: (d.nombre as string) ?? null,
    sedeCod: (d.sede_cod as string) ?? null,
    userAgent: (d.user_agent as string) ?? null,
    estado: d.estado as Dispositivo['estado'],
    compartido: Boolean(d.compartido),
    creadoEn: d.creado_en as string,
    aprobadoEn: (d.aprobado_en as string) ?? null,
    ultimoVisto: d.ultimo_visto as string,
  }));
}

// Asignar/editar la sede de un equipo (Fase 2: "el dispositivo manda" — el admin decide qué sede
// pre-marca el login en cada PC). Update directo de tabla, no RPC: la policy `disp_admin_rw`
// (0036) ya exige app_es_admin() para escribir cualquier columna de dispositivos_autorizados.
export async function actualizarSedeDispositivo(id: string, sedeCod: string | null): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('dispositivos_autorizados')
    .update({ sede_cod: sedeCod || null })
    .eq('id', id);
  if (error) throw error;
}

// Marca/desmarca un equipo como compartido (migración 0112). Update directo, como la sede: la policy
// `disp_admin_rw` (0036) ya exige app_es_admin() para escribir cualquier columna.
export async function actualizarCompartidoDispositivo(id: string, compartido: boolean): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('dispositivos_autorizados').update({ compartido }).eq('id', id);
  if (error) throw error;
}

// Sede pre-marcada del equipo ACTUAL, resuelta ANTES de autenticar (login/page.tsx: "el
// dispositivo manda"). Usa el cliente admin porque corre sin sesión — mismo patrón que
// listarSedesPublico() en sedes-repo.ts. Nunca lanza: sin match, sin service_role o cualquier
// error devuelve null y el login cae a su default (primera sede de la lista).
export async function sedeDispositivoPublico(deviceId: string): Promise<string | null> {
  if (!deviceId || !adminConfigurado()) return null;
  try {
    const { data, error } = await getAdminClient()
      .from('dispositivos_autorizados')
      .select('sede_cod')
      .eq('device_id', deviceId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { sede_cod: string | null }).sede_cod ?? null;
  } catch {
    return null;
  }
}

// Personas activas con la marca de «cuenta de equipo compartido» (migración 0112, spec
// codigo-personal §0 E-3). Sólo admin usa esta lista (/dispositivos). No lee `cod`: el PIN y el
// usuario se validan sólo en la base.
export type CuentaEquipo = { id: string; nombre: string; cuentaCompartida: boolean };

export async function listarCuentasEquipo(): Promise<CuentaEquipo[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleados')
    .select('id, nombre, cuenta_compartida')
    .eq('activo', true)
    .order('nombre');
  // 42703: la columna no existe todavía (0112 sin aplicar) → lista vacía, la sección no se muestra.
  if (error?.code === '42703') return [];
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id as string,
    nombre: e.nombre as string,
    cuentaCompartida: Boolean(e.cuenta_compartida),
  }));
}
