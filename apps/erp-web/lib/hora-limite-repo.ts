import { getServerClient } from './supabase/server';

// Hora límite de envío del reporte por sede y turno (migración 0184). Si una sede no tiene fila,
// vale la global de /configuracion (turno_m_cierre, turno_t_cierre, turno_c_cierre).
export type TurnoHora = 'M' | 'T' | 'C';
export type HoraLimite = { sedeCod: string; turno: TurnoHora; hora: string };

export async function listarHorasLimite(): Promise<HoraLimite[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('reporte_hora_limite').select('sede_cod, turno, hora');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    sedeCod: r.sede_cod as string,
    turno: r.turno as TurnoHora,
    hora: String(r.hora).slice(0, 5),
  }));
}

/** hora vacía = quitar el ajuste de la sede y volver a la global. Solo el administrador (lo exige la RPC). */
export async function guardarHoraLimite(sede: string, turno: TurnoHora, hora: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('reporte_hora_limite_guardar', { p_sede: sede, p_turno: turno, p_hora: hora || null });
  if (error) throw new Error(error.message.replace(/^(PERMISO|DATO):\s*/, ''));
}
