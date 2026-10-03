import { getServerClient } from './supabase/server';
import {
  CONFIG_CATALOGO,
  CONFIG_CATALOGO_MAP,
  etiquetaDesdeClave,
  ordenarSecciones as _ordenarSecciones,
  type ConfigTipo,
  type ConfigItem,
} from './config-catalogo';

// Re-exportados por compatibilidad: el resto del código (incluido app/configuracion/cliente.tsx)
// sigue importando ConfigItem/ordenarSecciones de aquí. La definición real vive en
// config-catalogo.ts (sin imports de servidor) para que un componente 'use client' pueda
// importarla directo sin arrastrar next/headers al bundle — ver el comentario grande ahí.
export type { ConfigItem };
export const ordenarSecciones = _ordenarSecciones;

// Defaults de horas de cierre de turno (Fase 4 tarea 5): MISMOS valores que regían hardcodeados
// en packages/db/migrations/0021_reportes_auto_cierre.sql antes de esa fase. Compartido entre
// /reportes/nuevo (cuenta regresiva del formulario) y el dashboard (panel de cobertura, Fase 6) —
// no es una hora confirmada por el dueño, ver docs/pendientes-negocio.md.
export const CIERRE_TURNO_DEFAULT = { M: '15:00', T: '23:00', C: '23:00' } as const;

// select('*') a propósito (lección de la Fase 4): las columnas tipo/descripcion/seccion/opciones
// son de la migración 0058, que puede no estar aplicada — pedirlas por nombre en el select
// tumbaría la página entera con un 500 si no existen. Con '*' simplemente no vienen esas claves.
type RowConfig = {
  clave: string;
  valor: string | null;
  tipo?: ConfigTipo | null;
  descripcion?: string | null;
  seccion?: string | null;
  opciones?: string[] | null;
};

const TIPOS_VALIDOS: ConfigTipo[] = ['numero', 'booleano', 'texto', 'lista', 'color', 'horario'];

function tipoValido(t: unknown): ConfigTipo {
  return TIPOS_VALIDOS.includes(t as ConfigTipo) ? (t as ConfigTipo) : 'texto';
}

export async function listarConfig(): Promise<ConfigItem[]> {
  const sb = getServerClient();
  const { data, error } = await sb.from('config').select('*').order('clave');
  if (error) throw new Error(error.message);
  const filas = (data as RowConfig[]) ?? [];
  const porClave = new Map(filas.map((f) => [f.clave, f]));

  const items: ConfigItem[] = [];

  // 1) Todo lo del catálogo, EXISTA o no todavía la fila en `config`.
  for (const c of CONFIG_CATALOGO) {
    const fila = porClave.get(c.clave);
    items.push({
      clave: c.clave,
      valor: fila?.valor ?? c.default,
      tipo: c.tipo,
      seccion: c.seccion,
      etiqueta: c.etiqueta,
      descripcion: c.descripcion,
      default: c.default,
      opciones: c.opciones,
      min: c.min,
      max: c.max,
      step: c.step,
      unidad: c.unidad,
      guardado: fila != null,
      esPersonalizado: false,
    });
  }

  // 2) Filas en la base que NO están en el catálogo → personalizadas (creadas desde la UI, o
  //    filas legacy de antes de esta fase que no encajan en ningún grupo conocido).
  for (const f of filas) {
    if (CONFIG_CATALOGO_MAP.has(f.clave)) continue;
    items.push({
      clave: f.clave,
      valor: f.valor ?? '',
      tipo: tipoValido(f.tipo),
      seccion: f.seccion?.trim() || 'Personalizados',
      etiqueta: etiquetaDesdeClave(f.clave),
      descripcion: f.descripcion ?? '',
      default: null,
      opciones: f.opciones ?? undefined,
      guardado: true,
      esPersonalizado: true,
    });
  }

  return items;
}

export async function guardarConfig(items: { clave: string; valor: string }[]): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('config').upsert(items, { onConflict: 'clave' });
  if (error) throw new Error(error.message);
}

function esColumnaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' || /column .* does not exist|could not find/i.test(error.message ?? '');
}

// Crea un parámetro NUEVO (no estaba en el catálogo ni en la base) con su propio tipo/descripción.
// Requiere la migración 0058 (columnas tipo/descripcion/seccion/opciones en `config`) — si todavía
// no está aplicada, PostgREST devuelve "column does not exist" y se traduce a un mensaje claro en
// vez de un 500 críptico (mismo espíritu que XxxNoMigradoError en otros repos, pero acotado a esta
// única acción: el resto de /configuracion funciona igual sin la migración).
export async function crearParametroConfig(p: {
  clave: string;
  valor: string;
  tipo: ConfigTipo;
  seccion: string;
  descripcion: string;
  opciones?: string[];
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('config').insert({
    clave: p.clave,
    valor: p.valor,
    tipo: p.tipo,
    seccion: p.seccion || 'Personalizados',
    descripcion: p.descripcion,
    opciones: p.tipo === 'lista' ? p.opciones ?? [] : null,
  });
  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe un parámetro con la clave "${p.clave}".`);
    if (esColumnaInexistente(error)) {
      throw new Error('Falta aplicar la migración 0058 (columnas tipo/descripción/sección de config) para crear parámetros nuevos.');
    }
    throw new Error(error.message);
  }
}

export async function eliminarParametroConfig(clave: string): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.from('config').delete().eq('clave', clave);
  if (error) throw new Error(error.message);
}

// Lee un mapa clave→valor (para cálculos que dependen de config, p. ej. la nota de evaluación).
export async function leerConfigMap(): Promise<Record<string, string>> {
  const sb = getServerClient();
  const { data, error } = await sb.from('config').select('clave, valor');
  if (error) throw new Error(error.message);
  return Object.fromEntries(((data as { clave: string; valor: string | null }[]) ?? []).map((c) => [c.clave, c.valor ?? '']));
}
