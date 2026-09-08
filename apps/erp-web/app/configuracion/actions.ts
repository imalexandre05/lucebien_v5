'use server';

import { revalidatePath } from 'next/cache';
import { getSesion } from '../../lib/auth';
import { guardarConfig, crearParametroConfig, eliminarParametroConfig } from '../../lib/config-repo';
import { CONFIG_CATALOGO_MAP, type ConfigTipo } from '../../lib/config-catalogo';
import { actualizarAlertaRegla } from '../../lib/notificaciones-repo';

type R = { ok: boolean; error?: string };
const fallo = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Error' });

async function exigirAdmin(): Promise<R | null> {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) return { ok: false, error: 'Solo admin/dueño' };
  return null;
}

// El catálogo (lib/config-catalogo.ts) ya declara el tipo y el rango de cada parámetro conocido;
// esto solo lo hace cumplir antes de escribir. Sin esta comprobación un número vacío o con letras
// se guarda tal cual y el fallo aparece después y lejos: `private.evaluacion_componentes_datos`
// castea el valor a numeric, devuelve el error 22P02 y el botón "Calcular" de /evaluaciones deja
// de funcionar para todos, con texto crudo de Postgres en pantalla.
//
// No se valida un parámetro personalizado (no está en el catálogo: no declara tipo ni rango), ni
// se exige que los 7 pesos de la nota sumen 1 — esa regla no está decidida todavía.
function primerErrorDeCatalogo(items: { clave: string; valor: string }[]): string | null {
  for (const item of items) {
    const def = CONFIG_CATALOGO_MAP.get(item.clave);
    if (!def || def.tipo !== 'numero') continue;
    const crudo = (item.valor ?? '').trim();
    if (crudo === '') return `"${def.etiqueta}" no puede quedar vacío: es un número.`;
    const n = Number(crudo);
    if (!Number.isFinite(n)) return `"${def.etiqueta}" debe ser un número (se recibió "${item.valor}").`;
    if (def.min !== undefined && n < def.min) return `"${def.etiqueta}" no puede ser menor que ${def.min}.`;
    if (def.max !== undefined && n > def.max) return `"${def.etiqueta}" no puede ser mayor que ${def.max}.`;
  }
  return null;
}

/**
 * Un parámetro de `config` cambia el comportamiento de MEDIO SISTEMA, no de esta pantalla.
 *
 * Hasta el 25-ago-2026 acá sólo se hacía `revalidatePath('/configuracion')`, así que el valor nuevo
 * se guardaba bien en la base pero las OTRAS once pantallas que leen parámetros seguían sirviendo
 * su render cacheado con el valor viejo. Alexander lo reportó con un caso concreto: cambiaron
 * `sueldo_tolerancia_minutos` a 0 y «los cambios no se aplicaron» — verificado contra `scilb`, el 0
 * SÍ estaba guardado; lo que no se había refrescado era todo lo demás.
 *
 * Las once, hoy: `/` (landing), `/evaluaciones`, `/mi-desempeno`, `/valores`,
 * `/personal/[id]/evaluacion`, `/personal/[id]/asistencias`, `/sueldos/asistencia`,
 * `/sueldos/ventas`, `/reportes/nuevo`, más lo que consumen `sueldos-repo` y `pos-config`.
 * Enumerarlas una por una sería una lista que se desactualiza sola: se revalida la raíz con
 * `'layout'`, que es exactamente lo que ya hacía `/configuracion/permisos` desde antes —ahí el
 * mismo problema se había resuelto bien, dos carpetas más allá, y esta pantalla no lo copió.
 */
function revalidarTodoLoQueLeeConfig(): void {
  revalidatePath('/configuracion');
  revalidatePath('/', 'layout');
}

export async function accionGuardarConfig(items: { clave: string; valor: string }[]): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    const invalido = primerErrorDeCatalogo(items);
    if (invalido) return { ok: false, error: invalido };
    await guardarConfig(items);
    revalidarTodoLoQueLeeConfig();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

const CLAVE_RE = /^[a-z][a-z0-9_]{1,49}$/;
const TIPOS: ConfigTipo[] = ['numero', 'booleano', 'texto', 'lista', 'color', 'horario'];

export async function accionCrearParametroConfig(p: {
  clave: string;
  valor: string;
  tipo: ConfigTipo;
  seccion: string;
  descripcion: string;
  opciones?: string[];
}): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    const clave = p.clave.trim().toLowerCase();
    if (!CLAVE_RE.test(clave)) {
      return { ok: false, error: 'La clave debe empezar con una letra y usar solo minúsculas, números y guion bajo (ej. "mi_parametro").' };
    }
    if (!TIPOS.includes(p.tipo)) return { ok: false, error: 'Tipo inválido.' };
    if (p.tipo === 'lista' && (!p.opciones || p.opciones.length < 2)) {
      return { ok: false, error: 'Una lista necesita al menos 2 opciones.' };
    }
    await crearParametroConfig({ ...p, clave });
    revalidarTodoLoQueLeeConfig();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function accionEliminarParametroConfig(clave: string): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    await eliminarParametroConfig(clave);
    revalidarTodoLoQueLeeConfig();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// C-6 de la spec de notificaciones: enciende/apaga una regla de `alertas_reglas` y ajusta su
// umbral. Sólo esos dos campos — `actualizarAlertaRegla()` en notificaciones-repo.ts ya deja
// afuera `destinatario_rol` a propósito, ver el comentario ahí.
export async function accionActualizarAlertaRegla(tipo: string, p: { activa: boolean; umbral: number | null }): Promise<R> {
  try {
    const bloqueo = await exigirAdmin();
    if (bloqueo) return bloqueo;
    if (p.umbral !== null && (!Number.isFinite(p.umbral) || p.umbral < 0)) {
      return { ok: false, error: 'El umbral debe ser un número ≥ 0.' };
    }
    await actualizarAlertaRegla(tipo, p);
    revalidarTodoLoQueLeeConfig();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
