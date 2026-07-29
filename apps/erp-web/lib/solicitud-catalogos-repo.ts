import type { CamposSolicitudPrenda } from '@scilb/core';
import { getServerClient } from './supabase/server';

// Catálogos de Solicitudes (Fase 11, migración 0056): colores, artículos y tipos de prenda
// (extendiendo producto_tipos de la Fase 7 en vez de duplicarlo). Todos "de configuración, no
// hardcodeados" — texto literal del plan — así que viven en tablas editables por el admin, no en
// constantes de JS como el sistema viejo (SOLI_COLORES/SOLI_ARTICULOS/SOLI_CFG en public/js/
// solicitudes.js). Degradan a [] con elegancia si sus tablas/columnas todavía no existen (mismo
// patrón que listarTiposProducto() en producto-tipos-repo.ts) — el picker cae a un input libre.

function esTablaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message ?? '');
}

export type ColorSolicitud = { nombre: string; hex: string };

export async function listarColoresSolicitud(): Promise<ColorSolicitud[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('solicitud_colores').select('*').eq('activo', true).order('orden');
  if (error) {
    if (esTablaInexistente(error)) return [];
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({ nombre: String(r.nombre), hex: String(r.hex) }));
}

export type ArticuloSolicitud = { categoria: string; nombre: string };

export async function listarArticulosSolicitud(): Promise<ArticuloSolicitud[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('solicitud_articulos')
    .select('*')
    .eq('activo', true)
    .order('categoria')
    .order('orden');
  if (error) {
    if (esTablaInexistente(error)) return [];
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({ categoria: String(r.categoria), nombre: String(r.nombre) }));
}

export type TipoPrendaSolicitud = {
  cod: string;
  nombre: string;
  camposSolicitud: CamposSolicitudPrenda;
};

// select('*') a propósito (lección de la Fase 4: nunca pedir una columna nueva por nombre
// explícito) — si `campos_solicitud` todavía no existe en este entorno (0056 sin aplicar sobre un
// producto_tipos de la 0055 que sí lo está), simplemente no viene en la fila y el filtro de abajo
// la excluye sola; si la TABLA entera no existe, esTablaInexistente ya degrada a [].
export async function listarTiposPrendaSolicitud(): Promise<TipoPrendaSolicitud[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('producto_tipos').select('*').eq('activo', true).order('nombre');
  if (error) {
    if (esTablaInexistente(error)) return [];
    throw new Error(error.message);
  }
  return ((data as Record<string, unknown>[]) ?? [])
    .filter((r) => r.campos_solicitud != null)
    .map((r) => ({
      cod: String(r.cod),
      nombre: String(r.nombre),
      camposSolicitud: r.campos_solicitud as CamposSolicitudPrenda,
    }));
}
