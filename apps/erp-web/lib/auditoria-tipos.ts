// auditoria-tipos.ts — tipos + lógica pura de Auditoría, SIN imports de servidor (sin
// getServerClient/next-headers). Separado de auditoria-repo.ts a propósito: un componente
// 'use client' (app/administracion/auditoria/cliente.tsx) necesita estos valores/tipos en
// tiempo de ejecución (TABLAS_AUDITADAS, TABLA_LABEL, camposCambiados), y CUALQUIER import de un
// binding real (no `import type`) desde auditoria-repo.ts arrastraría next/headers al bundle del
// navegador y tumbaría la página con un 500 — mismo bug que ya tumbó /configuracion la primera vez
// que se escribió esta fase (ver el comentario en config-catalogo.ts).

export type OperacionAudit = 'INSERT' | 'UPDATE' | 'DELETE';

// LA LISTA TIENE QUE COINCIDIR CON LOS TRIGGERS DE LA BASE, no con lo que se auditaba el día que
// se escribió esta constante. El filtro de la pantalla se arma con esta lista: lo que no está acá
// es rastro guardado al que nadie puede llegar. Elegir «Pedidos» devolvía una lista vacía mientras
// los 138 movimientos estaban en la base, y los 4.809 de asistencias —la tabla que más escribe, y
// la que decide un sueldo— no tenían ni entrada en el desplegable.
//
// Verificado el 24-ago-2026 contra `pg_trigger`: catorce triggers `trg_audit_*` ya vivos —
// `solicitudes` entre ellos, desde la migración 0087—, más `config`, que llega con la 0088.
// Faltaban las cinco tablas `sueldo_*` de la cadena de liquidación, que son justamente las que hay
// que poder auditar cuando alguien discute un pago.
export const TABLAS_AUDITADAS = [
  'asistencias',
  'sueldo_acuerdos',
  'sueldo_acuerdo_turnos',
  'sueldo_liquidaciones',
  'sueldo_liquidacion_lineas',
  'sueldo_liquidacion_pagos',
  'sueldo_movimientos',
  'sueldo_ventas',
  'evaluaciones_mensuales',
  'empleados',
  'config',
  'solicitudes',
  'pedidos',
  'caja_movimientos',
  'pagos',
  'reporte_hora_limite',
] as const;
export type TablaAuditada = (typeof TABLAS_AUDITADAS)[number];

export const TABLA_LABEL: Record<TablaAuditada, string> = {
  asistencias: 'Asistencias',
  sueldo_acuerdos: 'Contratos',
  sueldo_acuerdo_turnos: 'Horarios',
  sueldo_liquidaciones: 'Liquidaciones',
  sueldo_liquidacion_lineas: 'Líneas de liquidación',
  sueldo_liquidacion_pagos: 'Abonos de sueldo',
  sueldo_movimientos: 'Adelantos y descuentos',
  sueldo_ventas: 'Ventas para comisión',
  evaluaciones_mensuales: 'Evaluaciones',
  empleados: 'Personas',
  config: 'Configuración',
  solicitudes: 'Solicitudes',
  pedidos: 'Pedidos',
  caja_movimientos: 'Caja',
  pagos: 'Pagos',
  reporte_hora_limite: 'Hora límite de reportes',
};

// El tamaño de la ventana de CADA consulta, no del módulo entero. Vive acá —y no sólo en el
// repositorio— porque la pantalla necesita el mismo número para avisar, cuando la consulta lo
// toca, que hay más rastro del que está mostrando. Mientras el 200 estuvo escrito dos veces
// (repo y pantalla), el aviso podía dejar de coincidir con el corte real sin que nada avisara.
export const LIMITE_AUDITORIA = 200;

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
