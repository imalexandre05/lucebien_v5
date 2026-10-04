// Rangos de fecha para MIRAR datos por día, semana o mes, con anterior/siguiente. Puro, sin IO.
//
// La semana es de lunes a domingo: la misma convención que ya usan claveBucket() de
// estadisticas.ts y diaSemanaISO() de sueldos.ts. NO son los tramosSemanales() de RN-12, que
// arrancan en el inicio del contrato y deciden el bono: esto es sólo una vista.
//
// El "hoy" lo pasa quien llama (hoyPeru()): el core no llama new Date() (no-negociable 4).

export type VistaRango = 'dia' | 'semana' | 'mes' | 'rango';
export const VISTAS_RANGO: VistaRango[] = ['dia', 'semana', 'mes', 'rango'];

export type RangoFechas = { desde: string; hasta: string }; // YYYY-MM-DD inclusive

const MS_DIA = 86_400_000;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ms = (f: string): number => {
  const [y, m, d] = f.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmt = (t: number): string => new Date(t).toISOString().slice(0, 10);

// Años que se aceptan desde la URL. DEFAULT DE PANTALLA, no regla de negocio: fuera de este margen
// una fecha como 9999-12-31 empuja la semana al año 10000, toISOString() devuelve '+010000-…' y la
// consulta revienta. Una fecha fuera del margen se trata como inválida y cae a hoy.
const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

/**
 * `true` sólo para una fecha 'YYYY-MM-DD' que existe en el calendario (rechaza 2026-02-30) y cuyo
 * año está entre ANIO_MIN y ANIO_MAX.
 */
export function esFechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !ES_FECHA.test(f) || fmt(ms(f)) !== f) return false;
  const anio = Number(f.slice(0, 4));
  return anio >= ANIO_MIN && anio <= ANIO_MAX;
}

/** Suma (o resta) días a una fecha. */
export function sumarDias(f: string, dias: number): string {
  return fmt(ms(f) + dias * MS_DIA);
}

/** El lunes de la semana que contiene `f`. */
export function lunesDeSemana(f: string): string {
  const dow = (new Date(ms(f)).getUTCDay() + 6) % 7; // 0 = lunes
  return sumarDias(f, -dow);
}

/** Primer y último día del mes calendario de `f`. */
export function mesDe(f: string): RangoFechas {
  const [y, m] = f.split('-').map(Number);
  return { desde: fmt(Date.UTC(y, m - 1, 1)), hasta: fmt(Date.UTC(y, m, 0)) };
}

/** El rango de una vista fija (día, semana o mes) que contiene a `ancla`. */
export function rangoDeVista(vista: Exclude<VistaRango, 'rango'>, ancla: string): RangoFechas {
  if (vista === 'dia') return { desde: ancla, hasta: ancla };
  if (vista === 'semana') {
    const lunes = lunesDeSemana(ancla);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  return mesDe(ancla);
}

/** Días de calendario del rango, ambos extremos incluidos. */
export function diasDelRango(r: RangoFechas): number {
  return Math.round((ms(r.hasta) - ms(r.desde)) / MS_DIA) + 1;
}

/**
 * El rango `pasos` lugares antes (negativo) o después (positivo) del actual.
 * Día ±1 día · semana ±7 días · mes ±1 mes calendario · rango: se corre su propio largo.
 */
export function desplazarRango(vista: VistaRango, r: RangoFechas, pasos: number): RangoFechas {
  if (vista === 'dia') return rangoDeVista('dia', sumarDias(r.desde, pasos));
  if (vista === 'semana') return rangoDeVista('semana', sumarDias(r.desde, 7 * pasos));
  if (vista === 'mes') {
    // Desde el día 1, así un 31 nunca se desborda al mes que sigue.
    const [y, m] = r.desde.split('-').map(Number);
    return mesDe(fmt(Date.UTC(y, m - 1 + pasos, 1)));
  }
  const largo = diasDelRango(r);
  return { desde: sumarDias(r.desde, largo * pasos), hasta: sumarDias(r.hasta, largo * pasos) };
}

/**
 * Lee vista y rango de los parámetros de una URL.
 *
 * - Sin `vista` (o con una desconocida) se usa `porDefecto`; si es `null`, devuelve `null`: la
 *   pantalla decide qué mostrar sin rango (por ejemplo, el contrato entero).
 * - Día, semana y mes usan `desde` como ancla y recalculan `hasta`. Sin `desde` válido, `hoy`.
 * - Rango usa `desde` y `hasta`; si vienen al revés se dan vuelta, y el que falte se completa con
 *   el otro (o con `hoy`).
 */
export function resolverRango(
  params: { vista?: string | null; desde?: string | null; hasta?: string | null },
  hoy: string,
  porDefecto: VistaRango | null,
): { vista: VistaRango; rango: RangoFechas } | null {
  const pedida = VISTAS_RANGO.find((v) => v === params.vista);
  const vista = pedida ?? porDefecto;
  if (!vista) return null;

  const desde = esFechaValida(params.desde) ? params.desde : null;
  const hasta = esFechaValida(params.hasta) ? params.hasta : null;

  if (vista === 'rango') {
    const a = desde ?? hasta ?? hoy;
    const b = hasta ?? desde ?? hoy;
    return { vista, rango: a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a } };
  }
  return { vista, rango: rangoDeVista(vista, desde ?? hoy) };
}

/**
 * Recorta un rango a `maxDias` como máximo, conservando `hasta` (lo más reciente es lo que se
 * vino a mirar). `recortado` dice si hubo que cortar, para que la pantalla lo avise.
 */
export function recortarRango(r: RangoFechas, maxDias: number): { rango: RangoFechas; recortado: boolean } {
  if (diasDelRango(r) <= maxDias) return { rango: r, recortado: false };
  return { rango: { desde: sumarDias(r.hasta, -(maxDias - 1)), hasta: r.hasta }, recortado: true };
}
