// auditoria-tipos.ts — tipos + lógica pura de Auditoría, SIN imports de servidor (sin
// getServerClient/next-headers). Separado de auditoria-repo.ts a propósito: un componente
// 'use client' (app/administracion/auditoria/cliente.tsx) necesita estos valores/tipos en
// tiempo de ejecución (TABLAS_AUDITADAS, TABLA_LABEL, camposCambiados), y CUALQUIER import de un
// binding real (no `import type`) desde auditoria-repo.ts arrastraría next/headers al bundle del
// navegador y tumbaría la página con un 500 — mismo bug que ya tumbó /configuracion la primera vez
// que se escribió esta fase (ver el comentario en config-catalogo.ts).

export type OperacionAudit = 'INSERT' | 'UPDATE' | 'DELETE';

// LA LISTA TIENE QUE COINCIDIR CON LOS TRIGGERS DE LA BASE, no con lo que se auditaba el día que
// se escribió esta constante. Faltaban cuatro de las ocho tablas que ya escriben en `audit_log`, y
// el filtro de la pantalla se arma con esta lista: elegir «Pedidos» devolvía una lista vacía
// mientras el rastro entero estaba guardado, y los 4.809 movimientos de asistencias —la tabla que
// más escribe, y la que decide un sueldo— no tenían ni entrada en el desplegable.
// Verificado contra `select distinct tabla from audit_log` el 23-ago-2026, más `solicitudes`, que
// empieza a auditarse con la migración 0087.
export const TABLAS_AUDITADAS = [
  'asistencias',
  'sueldo_acuerdos',
  'sueldo_acuerdo_turnos',
  'evaluaciones_mensuales',
  'empleados',
  'solicitudes',
  'pedidos',
  'caja_movimientos',
  'pagos',
] as const;
export type TablaAuditada = (typeof TABLAS_AUDITADAS)[number];

export const TABLA_LABEL: Record<TablaAuditada, string> = {
  asistencias: 'Asistencias',
  sueldo_acuerdos: 'Contratos',
  sueldo_acuerdo_turnos: 'Horarios',
  evaluaciones_mensuales: 'Evaluaciones',
  empleados: 'Personas',
  solicitudes: 'Solicitudes',
  pedidos: 'Pedidos',
  caja_movimientos: 'Caja',
  pagos: 'Pagos',
};

export type AuditLogFila = {
  id: number;
  tabla: string;
  operacion: OperacionAudit;
  filaId: string;
  actorId: string | null;
  actorNombre: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  at: string;
};

// Campos que cambiaron entre antes/despues (para el detalle del modal) — ignora claves que no
// cambiaron para no repetir toda la fila en pantalla. Con INSERT (antes=null) o DELETE
// (despues=null) simplemente no hay "cambios", se muestra la fila completa tal cual.
export type CampoCambiado = { campo: string; antes: unknown; despues: unknown };

export function camposCambiados(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): CampoCambiado[] {
  if (!antes || !despues) return [];
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const out: CampoCambiado[] = [];
  for (const campo of claves) {
    const a = antes[campo];
    const d = despues[campo];
    if (JSON.stringify(a) !== JSON.stringify(d)) out.push({ campo, antes: a, despues: d });
  }
  return out.sort((x, y) => x.campo.localeCompare(y.campo));
}
