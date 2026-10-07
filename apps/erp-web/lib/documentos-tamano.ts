// Tope de tamaño de los documentos del personal. Módulo puro (sin imports de servidor) para que lo
// usen tanto el navegador —antes de enviar— como el servidor (documentos-repo.ts).
//
// 4 MB y no 10: Vercel corta el cuerpo de una función en ~4,5 MB, sobre multipart incluido. Es un
// límite técnico provisional hasta tener subida directa a Storage con URL firmada (spec
// 2026-10-04-personal-ultimo-admin-alta-design.md, enmienda del 06-oct-2026; docs/pendientes-negocio.md).

export const TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024;

/** Devuelve el mensaje de error si el archivo excede el tope, o null si el tamaño es válido. */
export function errorDeTamano(bytes: number): string | null {
  if (bytes <= TAMANO_MAXIMO_BYTES) return null;
  return `El archivo pesa ${(bytes / 1024 / 1024).toFixed(1)} MB; el máximo es 4 MB. Reduce la foto o súbelo como PDF.`;
}
