import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';
import { TABLAS_AUDITADAS, TABLA_LABEL, camposCambiados, type AuditLogFila, type OperacionAudit, type CampoCambiado } from './auditoria-tipos';

// Auditoría (Fase 13 tarea 4): puerto del middleware de auditoría del sistema viejo
// (server.js:22-79, interceptaba res.json y registraba todo POST/PUT/DELETE con 2xx) pero como
// TRIGGERS de Postgres (migración 0058) — el ERP nuevo escribe por RPC y por PostgREST directo,
// así que un middleware de Express no vería nada de eso. Solo 5 tablas sensibles: pedidos,
// caja_movimientos, empleados, pagos, evaluaciones_mensuales. `prenda_pasada` queda fuera a
// propósito (alta frecuencia, instrucción explícita del plan).
//
// Los tipos + TABLAS_AUDITADAS/TABLA_LABEL/camposCambiados viven en auditoria-tipos.ts (sin
// imports de servidor) y se re-exportan aquí para quien los consuma desde el server
// (page.tsx). app/administracion/auditoria/cliente.tsx ('use client') importa DIRECTO de
// auditoria-tipos.ts, nunca de este archivo — ver el comentario grande ahí.
export { TABLAS_AUDITADAS, TABLA_LABEL, camposCambiados };
export type { AuditLogFila, OperacionAudit, CampoCambiado };

// "Falta aplicar la migración 0058" — mismo patrón que SolicitudesNoMigradoError/
// ValoresNoMigradoError: /administracion/auditoria debe avisar, no reventar con un 500, mientras
// esta migración (como 0050-0057) siga sin aplicarse contra la base real.
export class AuditoriaNoMigradoError extends Error {
  constructor() {
    super('Falta aplicar la migración 0058 (tabla audit_log y triggers de auditoría).');
    this.name = 'AuditoriaNoMigradoError';
  }
}

function esTablaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message ?? '');
}

type Row = {
  id: number;
  tabla: string;
  operacion: OperacionAudit;
  fila_id: string;
  actor: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  at: string;
};

export type FiltrosAuditoria = {
  tabla?: string;
  operacion?: OperacionAudit;
  actorId?: string;
  desde?: string; // 'YYYY-MM-DD'
  hasta?: string; // 'YYYY-MM-DD'
  limite?: number;
};

const LIMITE_DEFAULT = 200;

// Límite acotado (cuida el volumen, mismo espíritu de la instrucción de no auditar tablas de alta
// frecuencia): 200 filas por defecto, como el /api/audit del sistema viejo (limit por query param).
export async function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<AuditLogFila[]> {
  const sb = getServerClient();
  let q = sb
    .from('audit_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(Math.min(filtros.limite ?? LIMITE_DEFAULT, 1000));

  if (filtros.tabla) q = q.eq('tabla', filtros.tabla);
  if (filtros.operacion) q = q.eq('operacion', filtros.operacion);
  if (filtros.actorId) q = q.eq('actor', filtros.actorId);
  if (filtros.desde) q = q.gte('at', `${filtros.desde}T00:00:00`);
  if (filtros.hasta) q = q.lte('at', `${filtros.hasta}T23:59:59.999`);

  const { data, error } = await q;
  if (error) {
    if (esTablaInexistente(error)) throw new AuditoriaNoMigradoError();
    throw new Error(error.message);
  }

  const filas = (data as Row[]) ?? [];
  const nombre = await mapaNombres();
  return filas.map((r) => ({
    id: r.id,
    tabla: r.tabla,
    operacion: r.operacion,
    filaId: r.fila_id,
    actorId: r.actor,
    actorNombre: r.actor ? (nombre.get(r.actor) ?? 'Empleado eliminado') : null,
    antes: r.antes,
    despues: r.despues,
    at: r.at,
  }));
}
