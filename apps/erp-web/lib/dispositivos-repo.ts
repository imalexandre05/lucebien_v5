import { getServerClient } from './supabase/server';

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
    .select('id, device_id, nombre, sede_cod, user_agent, estado, creado_en, aprobado_en, ultimo_visto')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    deviceId: d.device_id as string,
    nombre: (d.nombre as string) ?? null,
    sedeCod: (d.sede_cod as string) ?? null,
    userAgent: (d.user_agent as string) ?? null,
    estado: d.estado as Dispositivo['estado'],
    creadoEn: d.creado_en as string,
    aprobadoEn: (d.aprobado_en as string) ?? null,
    ultimoVisto: d.ultimo_visto as string,
  }));
}
