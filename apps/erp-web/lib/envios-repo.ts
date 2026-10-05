import { limitesRangoPeru } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Envíos de prendas a tienda (envios_prendas + prenda_pasada.envio_id, 0005/0009).
// Lectura para la vista de confirmación en tienda y el historial del almacén.
//
// La restricción por tienda NO vive acá: la pone la RLS de envios_prendas (`envios_rw`, por sede
// destino). Los filtros sólo achican lo que la RLS ya deja ver. El join es `!inner` para que la
// RLS y los filtros actúen ANTES del límite: con un join suelto, las prendas cuyo envío la RLS
// oculta llegaban con `envios_prendas = null`, ocupaban cupo y se descartaban después.
// Spec: docs/superpowers/specs/pipeline/2026-10-03-envios-filtro-tienda-design.md

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

const COLUMNAS =
  'id, codigo, tipo, color, talla, sede_origen_cod, etapa, fecha_actualizado, envios_prendas!inner(id, sede_destino_cod, fecha, estado)';

// DEFAULT DE PANTALLA, no regla de negocio. Lo en camino es una cola de trabajo y se trae
// entera, sin paginar: una prenda pendiente que no se ve es una prenda que nadie confirma. El
// tope sólo protege el render (cada fila lleva sus botones). 1000 coincide con el `max_rows` que
// Supabase trae por defecto en PostgREST; este repo no versiona esa configuración, así que si
// alguien la baja de 1000 el aviso de `truncado` deja de dispararse. Con 4 sedes y despachos
// diarios, la cola esperable es de decenas. Si se llega al tope, la pantalla lo avisa.
export const TOPE_EN_CAMINO = 1000;
// DEFAULT DE PANTALLA: filas del historial por página (antes se mostraban 20 de un lote de 300).
// Paginación por offset: si alguien acepta prendas mientras otro navega, entre una página y la
// siguiente puede repetirse una fila. Es un historial de consulta; se acepta.
export const POR_PAGINA_RECIBIDAS = 50;

function mapear(r: Record<string, unknown>): PrendaEnviada {
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
}

/** Prendas despachadas que la tienda todavía no confirmó. Sin filtro de fecha: es pendiente. */
export async function listarEnviosEnCamino(f: {
  sede: string | null;
}): Promise<{ prendas: PrendaEnviada[]; truncado: boolean }> {
  let q = getServerClient()
    .from('prenda_pasada')
    .select(COLUMNAS)
    .eq('etapa', 'enviado')
    .not('envio_id', 'is', null);
  if (f.sede) q = q.eq('envios_prendas.sede_destino_cod', f.sede);
  // Las más antiguas primero: si algún día se llega al tope, lo que queda fuera es lo último que
  // llegó, nunca lo que lleva más tiempo esperando. Una fila de más dice si hay más.
  const { data, error } = await q
    .order('fecha_actualizado', { ascending: true })
    .order('id', { ascending: true })
    .limit(TOPE_EN_CAMINO + 1);
  if (error) throw new Error(error.message);
  const filas = (data as Record<string, unknown>[]) ?? [];
  return { prendas: filas.slice(0, TOPE_EN_CAMINO).map(mapear), truncado: filas.length > TOPE_EN_CAMINO };
}

/** Historial de recibidas, paginado. El rango filtra por la fecha del envío, en hora Perú. */
export async function listarEnviosRecibidos(f: {
  sede: string | null;
  desde: string | null;
  hasta: string | null;
  pagina: number;
}): Promise<{ prendas: PrendaEnviada[]; hayMas: boolean }> {
  let q = getServerClient()
    .from('prenda_pasada')
    .select(COLUMNAS)
    .eq('etapa', 'recibido')
    .not('envio_id', 'is', null);
  if (f.sede) q = q.eq('envios_prendas.sede_destino_cod', f.sede);
  const { gte, lt } = limitesRangoPeru(f.desde, f.hasta);
  if (gte) q = q.gte('envios_prendas.fecha', gte);
  if (lt) q = q.lt('envios_prendas.fecha', lt);
  // Una fila de más para saber si hay página siguiente sin pedir un count.
  const desdeFila = (f.pagina - 1) * POR_PAGINA_RECIBIDAS;
  const { data, error } = await q
    .order('fecha_actualizado', { ascending: false })
    .order('id', { ascending: true })
    .range(desdeFila, desdeFila + POR_PAGINA_RECIBIDAS);
  if (error) throw new Error(error.message);
  const filas = (data as Record<string, unknown>[]) ?? [];
  return {
    prendas: filas.slice(0, POR_PAGINA_RECIBIDAS).map(mapear),
    hayMas: filas.length > POR_PAGINA_RECIBIDAS,
  };
}
