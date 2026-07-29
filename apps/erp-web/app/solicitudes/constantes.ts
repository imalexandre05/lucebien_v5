import type { EstadoSolicitud, UrgenciaSolicitud } from '@scilb/core';
import type { Tone } from '../../components/ui/badge';

// Etiquetas/tonos compartidos entre cliente.tsx, detalle-solicitud.tsx y [id]/imprimir — un solo
// lugar para no repetir el mismo Record 3 veces (mismo criterio que TIPO_LABEL/TIPO_TONE en
// pedidos/cliente.tsx, pero ahí solo hace falta en un archivo).
export const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  entregada: 'Entregada',
  confirmada: 'Confirmada',
};

// pendiente=ámbar (por revisar) · aprobada=navy (en curso) · rechazada=red (bloqueada) ·
// entregada=green (éxito, acción de la tienda pendiente) · confirmada=gray (archivada/cerrada).
export const ESTADO_TONE: Record<EstadoSolicitud, Tone> = {
  pendiente: 'amber',
  aprobada: 'navy',
  rechazada: 'red',
  entregada: 'green',
  confirmada: 'gray',
};

export const URGENCIA_LABEL: Record<UrgenciaSolicitud, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
export const URGENCIA_TONE: Record<UrgenciaSolicitud, Tone> = { alta: 'red', media: 'amber', baja: 'green' };

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function resumenItems(items: { tipo: string }[]): string {
  if (!items.length) return '—';
  const extra = items.length > 3 ? ` +${items.length - 3}` : '';
  return items.slice(0, 3).map((i) => i.tipo).join(', ') + extra;
}
