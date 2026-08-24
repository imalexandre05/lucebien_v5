'use server';

import { puede, type MatrizPermisos } from '@scilb/core';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
import { listarAuditoria, AuditoriaNoMigradoError } from '../../../lib/auditoria-repo';
import { TABLAS_AUDITADAS, type AuditLogFila, type OperacionAudit } from '../../../lib/auditoria-tipos';

// El filtro de Auditoría, del lado del servidor.
//
// POR QUÉ EXISTE ESTE ARCHIVO. La pantalla traía las 200 filas más recientes y filtraba en el
// navegador. Como `asistencias` es el 92% de audit_log, esas 200 eran todas suyas y cualquier otro
// filtro devolvía una lista vacía con el rastro entero guardado en la base — ver
// docs/superpowers/specs/auditoria/2026-08-23-auditoria-alcance-y-config-design.md §A-1.
//
// POR QUÉ REVALIDA EL PERMISO. Una server action exportada es un extremo público: se puede invocar
// sin pasar por la pantalla. Dejarla sin control repetiría, del lado del servidor, el mismo error
// que esta auditoría encontró en la base — que la regla viva sólo en la pantalla. El criterio es
// idéntico al de page.tsx, y el mismo patrón que ya usa app/caja/actions.ts.
async function exigirAuditoria(): Promise<string | null> {
  const sesion = await getSesion();
  if (!sesion) return 'Sesión requerida';
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'auditoria', 'ver', sesion.usuario.rolCod)) {
    return 'No tienes permiso para ver la auditoría';
  }
  return null;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const OPERACIONES: OperacionAudit[] = ['INSERT', 'UPDATE', 'DELETE'];

export type RespuestaAuditoria = { ok: true; filas: AuditLogFila[] } | { ok: false; error: string };

export async function accionBuscarAuditoria(f: {
  tabla?: string;
  operacion?: string;
  desde?: string;
  hasta?: string;
}): Promise<RespuestaAuditoria> {
  const bloqueo = await exigirAuditoria();
  if (bloqueo) return { ok: false, error: bloqueo };

  // Sólo se dejan pasar valores que la propia pantalla ofrece: cualquier otra cosa se ignora en
  // vez de viajar hasta PostgREST.
  const tabla = TABLAS_AUDITADAS.includes(f.tabla as (typeof TABLAS_AUDITADAS)[number]) ? f.tabla : undefined;
  const operacion = OPERACIONES.includes(f.operacion as OperacionAudit) ? (f.operacion as OperacionAudit) : undefined;
  const desde = f.desde && FECHA_RE.test(f.desde) ? f.desde : undefined;
  const hasta = f.hasta && FECHA_RE.test(f.hasta) ? f.hasta : undefined;

  try {
    const filas = await listarAuditoria({ tabla, operacion, desde, hasta });
    return { ok: true, filas };
  } catch (e) {
    if (e instanceof AuditoriaNoMigradoError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer la auditoría' };
  }
}
