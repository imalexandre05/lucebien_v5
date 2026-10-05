import type { Usuario } from './permisos';

// ── Envíos a tienda: filtros de /pipeline/envios (spec 2026-10-03-envios-filtro-tienda) ──────
// Sólo deciden qué se OFRECE filtrar. La restricción real la pone la RLS (`envios_rw`, por sede
// destino); estas funciones nunca abren nada que la base no deje ver.

// Roles que ven el pipeline entero, igual que `app_es_admin() or app_es_almacen()` en la RLS.
const ROLES_PIPELINE_CENTRAL: ReadonlySet<Usuario['rol']> = new Set([
  'admin',
  'dueno',
  'encargado_almacen',
  'confeccionista',
]);

/** Sedes destino que la persona puede elegir en el filtro. `destinos` = tiendas del catálogo. */
export function sedesFiltroEnvios(u: Usuario, destinos: string[]): string[] {
  if (ROLES_PIPELINE_CENTRAL.has(u.rol)) return [...destinos];
  const propias = u.tiendas?.length ? u.tiendas : u.sede ? [u.sede] : [];
  return [...new Set(propias)];
}

export interface FiltrosEnvios {
  /** null = todas las que la RLS deje ver. */
  sede: string | null;
  /** 'YYYY-MM-DD' en hora Perú, o null. Siempre desde <= hasta cuando vienen los dos. */
  desde: string | null;
  hasta: string | null;
  /** Página del historial, desde 1. */
  pagina: number;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(v: string | undefined): string | null {
  if (!v || !FECHA_ISO.test(v)) return null;
  const [a, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null;
}

/** Lee los parámetros de la URL. Lo inválido se ignora en vez de fallar. */
export function leerFiltrosEnvios(
  params: Record<string, string | string[] | undefined>,
  opciones: string[],
): FiltrosEnvios {
  const uno = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const sedeUrl = uno('sede');
  // Con una sola opción no hay selector: la RLS ya deja ver sólo lo suyo.
  const sede = opciones.length > 1 && sedeUrl && opciones.includes(sedeUrl) ? sedeUrl : null;
  let desde = fechaValida(uno('desde'));
  let hasta = fechaValida(uno('hasta'));
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const pag = Number(uno('pag'));
  const pagina = Number.isInteger(pag) && pag >= 1 ? pag : 1;
  return { sede, desde, hasta, pagina };
}

/**
 * Límites `timestamptz` de un rango de días en hora Perú (UTC−5, sin horario de verano):
 * `gte` es el inicio de `desde` y `lt` el inicio del día siguiente a `hasta`.
 */
export function limitesRangoPeru(
  desde: string | null,
  hasta: string | null,
): { gte: string | null; lt: string | null } {
  let lt: string | null = null;
  if (hasta) {
    const [a, m, d] = hasta.split('-').map(Number);
    lt = `${new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10)}T00:00:00-05:00`;
  }
  return { gte: desde ? `${desde}T00:00:00-05:00` : null, lt };
}
