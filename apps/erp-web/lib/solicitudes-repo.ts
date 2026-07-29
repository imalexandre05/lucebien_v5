import type { EstadoSolicitud, UrgenciaSolicitud, CategoriaItemSolicitud } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

// ── Solicitudes: flujo tienda → almacén (Fase 11). I/O de packages/core/src/solicitudes.ts —
// los estados/permisos/transiciones son lógica pura allá (con test); esto es solo Supabase. ──

export type SolicitudItem = {
  id: string;
  categoria: CategoriaItemSolicitud;
  tipo: string;
  cantidad: number;
  color: string | null;
  talla: string | null;
  tela: string | null;
  modelo: string | null;
  detalle: string | null;
  obs: string | null;
  cantidadEnviada: number;
  cantidadRecibida: number;
  obsRecepcion: string | null;
  estadoItem: 'pendiente' | 'aprobado' | 'sin_stock';
};

export type Solicitud = {
  id: string;
  sedeCod: string;
  solicitanteId: string;
  solicitanteNombre: string | null;
  urgencia: UrgenciaSolicitud;
  estado: EstadoSolicitud;
  obs: string;
  obsRespuesta: string;
  aprobadoPorId: string | null;
  aprobadoPorNombre: string | null;
  fechaRespuesta: string | null;
  entregadoPorId: string | null;
  entregadoPorNombre: string | null;
  fechaEntrega: string | null;
  recibeEnTienda: string | null;
  codigosPrenda: Record<string, string[]> | null;
  confirmado: boolean;
  confirmadoPorId: string | null;
  confirmadoPorNombre: string | null;
  fechaConfirmacion: string | null;
  rechazadoPorId: string | null;
  rechazadoPorNombre: string | null;
  motivoRechazo: string | null;
  pedidoImpreso: boolean;
  fechaPedidoImpreso: string | null;
  confirmacionImpresa: boolean;
  fechaConfirmacionImpresa: string | null;
  createdAt: string;
  updatedAt: string;
  items: SolicitudItem[];
};

export type ItemSolicitudInput = {
  categoria: CategoriaItemSolicitud;
  tipo: string;
  cantidad: number;
  color?: string;
  talla?: string;
  tela?: string;
  modelo?: string;
  detalle?: string;
  obs?: string;
};

type ItemRow = {
  id: string;
  categoria: CategoriaItemSolicitud;
  tipo: string;
  cantidad: number;
  color: string | null;
  talla: string | null;
  tela: string | null;
  modelo: string | null;
  detalle: string | null;
  obs: string | null;
  cantidad_enviada: number;
  cantidad_recibida: number;
  obs_recepcion: string | null;
  estado_item: 'pendiente' | 'aprobado' | 'sin_stock';
};

type Row = {
  id: string;
  sede_cod: string;
  solicitante_id: string;
  urgencia: UrgenciaSolicitud;
  estado: EstadoSolicitud;
  obs: string | null;
  obs_respuesta: string | null;
  aprobado_por_id: string | null;
  fecha_respuesta: string | null;
  entregado_por_id: string | null;
  fecha_entrega: string | null;
  recibe_en_tienda: string | null;
  codigos_prenda: Record<string, string[]> | null;
  confirmado: boolean | null;
  confirmado_por_id: string | null;
  fecha_confirmacion: string | null;
  rechazado_por_id: string | null;
  motivo_rechazo: string | null;
  pedido_impreso: boolean | null;
  fecha_pedido_impreso: string | null;
  confirmacion_impresa: boolean | null;
  fecha_confirmacion_impresa: string | null;
  created_at: string;
  updated_at: string;
  solicitud_items?: ItemRow[] | null;
};

// "Falta aplicar la migración 0056" — degradación elegante (lección explícita de la Fase 4/7): la
// pantalla /solicitudes debe avisar en vez de reventar con un 500. Distinta de "sin catálogo"
// (listarColoresSolicitud etc. devuelven [] sin más — el módulo entero SÍ necesita avisar porque
// sin estas dos tablas no hay nada que mostrar).
export class SolicitudesNoMigradoError extends Error {
  constructor() {
    super('Falta aplicar la migración 0056 (tablas de Solicitudes).');
    this.name = 'SolicitudesNoMigradoError';
  }
}

// Error tipado de las RPC de transición: 'PREFIJO:detalle' (mismo contrato que ReporteCrearError
// en reportes-repo.ts). `detalle` ya es un mensaje en español listo para mostrar (lo redacta la
// propia función SQL, ver migración 0056) — no hay tabla de mensajes duplicada acá.
export class SolicitudTransicionError extends Error {
  prefijo?: string;
  constructor(message: string, prefijo?: string) {
    super(message);
    this.name = 'SolicitudTransicionError';
    this.prefijo = prefijo;
  }
}

function esTablaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message ?? '');
}

// Sin acceso a la BD real en este entorno (ver cabecera de la migración 0056) no se pudo verificar
// en vivo qué código exacto da PostgREST para "función RPC no encontrada" — se cubren el código
// nativo de Postgres (42883, undefined_function) y el que usa PostgREST para su propio schema
// cache en funciones (PGRST202, mismo mecanismo que PGRST205 para tablas) más un regex de reserva.
// Si el código real difiere una vez aplicada la migración, este es el primer lugar a corregir.
function esFuncionInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    /could not find the function/i.test(msg) ||
    /function .*solicitud_\w+.*does not exist/i.test(msg)
  );
}

function parsearErrorSolicitud(error: { message?: string; code?: string }): Error {
  if (esFuncionInexistente(error)) return new SolicitudesNoMigradoError();
  const msg = error.message ?? 'Error desconocido';
  const m = msg.match(/^([A-Z_]+):(.+)$/);
  if (m) return new SolicitudTransicionError(m[2], m[1]);
  return new SolicitudTransicionError(msg);
}

const PRIORIDAD_URGENCIA: Record<UrgenciaSolicitud, number> = { alta: 1, media: 2, baja: 3 };

function fromRow(r: Row, nombre: Map<string, string>): Solicitud {
  const n = (id: string | null) => (id ? (nombre.get(id) ?? null) : null);
  return {
    id: r.id,
    sedeCod: r.sede_cod,
    solicitanteId: r.solicitante_id,
    solicitanteNombre: n(r.solicitante_id),
    urgencia: r.urgencia,
    estado: r.estado,
    obs: r.obs ?? '',
    obsRespuesta: r.obs_respuesta ?? '',
    aprobadoPorId: r.aprobado_por_id,
    aprobadoPorNombre: n(r.aprobado_por_id),
    fechaRespuesta: r.fecha_respuesta,
    entregadoPorId: r.entregado_por_id,
    entregadoPorNombre: n(r.entregado_por_id),
    fechaEntrega: r.fecha_entrega,
    recibeEnTienda: r.recibe_en_tienda,
    codigosPrenda: r.codigos_prenda ?? null,
    confirmado: Boolean(r.confirmado),
    confirmadoPorId: r.confirmado_por_id,
    confirmadoPorNombre: n(r.confirmado_por_id),
    fechaConfirmacion: r.fecha_confirmacion,
    rechazadoPorId: r.rechazado_por_id,
    rechazadoPorNombre: n(r.rechazado_por_id),
    motivoRechazo: r.motivo_rechazo,
    pedidoImpreso: Boolean(r.pedido_impreso),
    fechaPedidoImpreso: r.fecha_pedido_impreso,
    confirmacionImpresa: Boolean(r.confirmacion_impresa),
    fechaConfirmacionImpresa: r.fecha_confirmacion_impresa,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: (r.solicitud_items ?? []).map((i) => ({
      id: i.id,
      categoria: i.categoria,
      tipo: i.tipo,
      cantidad: i.cantidad,
      color: i.color,
      talla: i.talla,
      tela: i.tela,
      modelo: i.modelo,
      detalle: i.detalle,
      obs: i.obs,
      cantidadEnviada: i.cantidad_enviada,
      cantidadRecibida: i.cantidad_recibida,
      obsRecepcion: i.obs_recepcion,
      estadoItem: i.estado_item,
    })),
  };
}

const SELECT = '*, solicitud_items(*)';

// RLS (migración 0056) ya filtra por sede: admin/almacén ven todas, el resto solo la suya — no
// hace falta repetir el filtro acá. Orden: urgencia (alta primero) y luego más reciente primero,
// mismo criterio que el ORDER BY CASE del sistema viejo (routes/solicitudes.js:33).
export async function listarSolicitudes(): Promise<Solicitud[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('solicitudes').select(SELECT).order('created_at', { ascending: false }).limit(300);
  if (error) {
    if (esTablaInexistente(error)) throw new SolicitudesNoMigradoError();
    throw new Error(error.message);
  }
  const nombre = await mapaNombres();
  return ((data as Row[]) ?? [])
    .map((r) => fromRow(r, nombre))
    .sort((a, b) => PRIORIDAD_URGENCIA[a.urgencia] - PRIORIDAD_URGENCIA[b.urgencia] || (a.createdAt < b.createdAt ? 1 : -1));
}

export async function obtenerSolicitud(id: string): Promise<Solicitud | null> {
  const sb = getServerClient();
  const { data, error } = await sb.from('solicitudes').select(SELECT).eq('id', id).maybeSingle();
  if (error) {
    if (esTablaInexistente(error)) throw new SolicitudesNoMigradoError();
    throw new Error(error.message);
  }
  if (!data) return null;
  const nombre = await mapaNombres();
  return fromRow(data as Row, nombre);
}

// ── Mutaciones vía RPC atómica (0056) — cada una valida el estado de origen server-side ──

export async function crearSolicitud(p: {
  sede: string;
  urgencia: UrgenciaSolicitud;
  obs: string;
  items: ItemSolicitudInput[];
}): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('solicitud_crear', {
    p_sede: p.sede,
    p_urgencia: p.urgencia,
    p_obs: p.obs,
    p_items: p.items,
  });
  if (error) throw parsearErrorSolicitud(error);
  return String(data);
}

export async function aprobarSolicitud(
  id: string,
  obsRespuesta: string,
  items?: { id: string; cantidadEnviada: number }[],
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('solicitud_aprobar', {
    p_id: id,
    p_obs_respuesta: obsRespuesta,
    p_items: items ? items.map((i) => ({ id: i.id, cantidad_enviada: i.cantidadEnviada })) : null,
  });
  if (error) throw parsearErrorSolicitud(error);
}

export async function rechazarSolicitud(id: string, motivo: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('solicitud_rechazar', { p_id: id, p_motivo: motivo });
  if (error) throw parsearErrorSolicitud(error);
}

export async function entregarSolicitud(
  id: string,
  recibeEnTienda: string,
  codigosPrenda?: Record<string, string[]>,
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('solicitud_entregar', {
    p_id: id,
    p_recibe_en_tienda: recibeEnTienda,
    p_codigos_prenda: codigosPrenda ?? null,
  });
  if (error) throw parsearErrorSolicitud(error);
}

export async function confirmarSolicitud(
  id: string,
  items?: { id: string; cantidadRecibida: number; obsRecepcion?: string }[],
): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('solicitud_confirmar', {
    p_id: id,
    p_items: items
      ? items.map((i) => ({ id: i.id, cantidad_recibida: i.cantidadRecibida, obs_recepcion: i.obsRecepcion ?? '' }))
      : null,
  });
  if (error) throw parsearErrorSolicitud(error);
}

export async function deshacerSolicitud(id: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('solicitud_deshacer', { p_id: id });
  if (error) throw parsearErrorSolicitud(error);
}

// Marcar impreso: flag simple de una fila, sin reglas de estado — no necesita RPC, solo RLS
// (mismo criterio que el resto de mutaciones triviales del proyecto, ej. incidencias-repo.ts).
export async function marcarImpresoSolicitud(id: string, tipo: 'pedido' | 'confirmacion'): Promise<void> {
  const sb = getServerClient();
  const campo =
    tipo === 'pedido'
      ? { pedido_impreso: true, fecha_pedido_impreso: new Date().toISOString() }
      : { confirmacion_impresa: true, fecha_confirmacion_impresa: new Date().toISOString() };
  const { error } = await sb.from('solicitudes').update(campo).eq('id', id);
  if (error) throw new Error(error.message);
}
