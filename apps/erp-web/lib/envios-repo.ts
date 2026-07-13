import { getServerClient } from './supabase/server';

// Envíos de prendas a tienda (envios_prendas + prenda_pasada.envio_id, 0005/0009).
// Lectura para la vista de confirmación en tienda y el historial del almacén.

export type PrendaEnviada = {
  id: string;
  codigo: string;
  tipo: string;
  color: string | null;
  talla: string | null;
  sedeOrigenCod: string;
  etapa: string;
  fechaActualizado: string | null;
  envioId: string;
  sedeDestinoCod: string;
  fechaEnvio: string;
  estadoEnvio: string;
};

export async function listarPrendasEnviadas(): Promise<PrendaEnviada[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('prenda_pasada')
    .select(
      'id, codigo, tipo, color, talla, sede_origen_cod, etapa, fecha_actualizado, envios_prendas(id, sede_destino_cod, fecha, estado)',
    )
    .in('etapa', ['enviado', 'recibido'])
    .not('envio_id', 'is', null)
    .order('fecha_actualizado', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  return ((data as Record<string, unknown>[]) ?? [])
    .filter((r) => r.envios_prendas)
    .map((r) => {
      const e = r.envios_prendas as Record<string, unknown>;
      return {
        id: String(r.id),
        codigo: String(r.codigo),
        tipo: String(r.tipo ?? ''),
        color: (r.color as string | null) ?? null,
        talla: (r.talla as string | null) ?? null,
        sedeOrigenCod: String(r.sede_origen_cod ?? ''),
        etapa: String(r.etapa),
        fechaActualizado: (r.fecha_actualizado as string | null) ?? null,
        envioId: String(e.id),
        sedeDestinoCod: String(e.sede_destino_cod),
        fechaEnvio: String(e.fecha ?? ''),
        estadoEnvio: String(e.estado ?? ''),
      };
    });
}
