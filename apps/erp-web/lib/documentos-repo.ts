// Adjuntos de personal (C-2/C-3, migración 0105): DNI, CV, imágenes. Sólo admin/dueño — la RLS de
// `empleado_documentos` y de `storage.objects` (bucket privado `empleado-documentos`) lo exige en
// las dos capas, así que este repo usa SIEMPRE getServerClient() (nunca getAdminClient(): eso
// bypassaría exactamente la RLS que la spec pide, y sumaría un séptimo archivo a la lista
// restringida del no-negociable 3).
//
// ORDEN DE ESCRITURA (spec §5): al subir, la fila de metadatos se inserta ANTES que el archivo
// llegue a Storage — si la subida falla después, queda una fila huérfana VISIBLE en vez de un
// archivo en Storage que ninguna consulta a la base puede encontrar. Al borrar es al revés: se
// borra el archivo primero y la fila después, por el mismo principio en la otra dirección.

import { getServerClient } from './supabase/server';
import { TAMANO_MAXIMO_BYTES, errorDeTamano } from './documentos-tamano';

const BUCKET = 'empleado-documentos';
export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
// Tope de 4 MB (límite de Vercel, ver documentos-tamano.ts); se reexporta para quien ya lo importaba.
export { TAMANO_MAXIMO_BYTES };

export type DocumentoEmpleado = {
  id: string;
  empleadoId: string;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
  storagePath: string;
  subidoPor: string | null;
  subidoEn: string;
};

const aDocumento = (r: Record<string, unknown>): DocumentoEmpleado => ({
  id: String(r.id),
  empleadoId: String(r.empleado_id),
  nombreArchivo: String(r.nombre_archivo ?? ''),
  tipoMime: String(r.tipo_mime ?? ''),
  tamanoBytes: Number(r.tamano_bytes ?? 0),
  storagePath: String(r.storage_path ?? ''),
  subidoPor: (r.subido_por as string | null) ?? null,
  subidoEn: String(r.subido_en ?? ''),
});

export async function listarDocumentos(empleadoId: string): Promise<DocumentoEmpleado[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleado_documentos')
    .select('id, empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path, subido_por, subido_en')
    .eq('empleado_id', empleadoId)
    .order('subido_en', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(aDocumento);
}

/**
 * Sube un documento: inserta metadatos, DESPUÉS sube el archivo (spec §5). Si la subida falla, la
 * fila de metadatos queda — es la señal visible de que algo no se completó, no se hace un rollback
 * automático que la escondería.
 */
export async function subirDocumento(
  empleadoId: string,
  archivo: File,
): Promise<DocumentoEmpleado> {
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    throw new Error(`Tipo de archivo no permitido: ${archivo.type || 'desconocido'}. Sólo imágenes (jpg, png, webp) o PDF.`);
  }
  const errorTamano = errorDeTamano(archivo.size);
  if (errorTamano) throw new Error(errorTamano);

  const sb = getServerClient();
  const ext = archivo.name.includes('.') ? archivo.name.slice(archivo.name.lastIndexOf('.')) : '';
  const path = `${empleadoId}/${crypto.randomUUID()}${ext}`;

  const { data, error } = await sb
    .from('empleado_documentos')
    .insert({
      empleado_id: empleadoId,
      nombre_archivo: archivo.name,
      tipo_mime: archivo.type,
      tamano_bytes: archivo.size,
      storage_path: path,
    })
    .select('id, empleado_id, nombre_archivo, tipo_mime, tamano_bytes, storage_path, subido_por, subido_en')
    .single();
  if (error) throw new Error(error.message);

  const { error: errorSubida } = await sb.storage.from(BUCKET).upload(path, archivo, {
    contentType: archivo.type,
    upsert: false,
  });
  if (errorSubida) {
    throw new Error(
      `Se registró el documento pero la subida a Storage falló: ${errorSubida.message}. Borralo e intentá de nuevo.`,
    );
  }

  return aDocumento(data as Record<string, unknown>);
}

/** Borra el archivo de Storage primero, la fila de metadatos después (spec §5, orden inverso al de subir). */
export async function eliminarDocumento(documentoId: string): Promise<void> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('empleado_documentos')
    .select('storage_path')
    .eq('id', documentoId)
    .single();
  if (error) throw new Error(error.message);
  const storagePath = String((data as Record<string, unknown>).storage_path);

  const { error: errorStorage } = await sb.storage.from(BUCKET).remove([storagePath]);
  if (errorStorage) throw new Error(errorStorage.message);

  const { error: errorFila } = await sb.from('empleado_documentos').delete().eq('id', documentoId);
  if (errorFila) throw new Error(errorFila.message);
}

/** URL firmada de corta duración para ver/descargar un documento — nunca pública (spec §3). */
export async function urlFirmadaDocumento(storagePath: string): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
