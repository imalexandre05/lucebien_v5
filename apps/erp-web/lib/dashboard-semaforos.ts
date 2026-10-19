// Semáforos del dashboard (sesión 8B). Lógica pura: sin base ni fechas del sistema.
//
// Cada semáforo tiene dos umbrales editables desde /configuracion (sección «Panel de inicio»).
// `ambar` y `rojo` son el valor desde el cual se pasa a ese color: por debajo de `ambar` es verde.
// Los defaults son una propuesta, NO confirmada por el dueño (ver docs/pendientes-negocio.md).

export type Luz = 'verde' | 'ambar' | 'rojo';

export type Umbral = { ambar: number; rojo: number };

/** Más es peor (días de atraso, reportes sin evaluar, faltas, incidencias). */
export function luzMayorEsPeor(valor: number, u: Umbral): Luz {
  if (valor >= u.rojo) return 'rojo';
  if (valor >= u.ambar) return 'ambar';
  return 'verde';
}

/** Más es mejor (porcentaje de metas cumplidas): `ambar`/`rojo` son pisos, rojo < ambar. */
export function luzMenorEsPeor(valor: number, u: Umbral): Luz {
  if (valor < u.rojo) return 'rojo';
  if (valor < u.ambar) return 'ambar';
  return 'verde';
}

/** El peor de varios colores (para el resumen de una tarjeta). */
export function peorLuz(luces: Luz[]): Luz {
  if (luces.includes('rojo')) return 'rojo';
  if (luces.includes('ambar')) return 'ambar';
  return 'verde';
}

export const CLAVES_DASHBOARD = {
  atrasoAmbar: 'dash_prenda_ambar_dias',
  atrasoRojo: 'dash_prenda_rojo_dias',
  evalAmbar: 'dash_eval_ambar',
  evalRojo: 'dash_eval_rojo',
  incidAmbar: 'dash_incid_ambar',
  incidRojo: 'dash_incid_rojo',
  faltasAmbar: 'dash_faltas_ambar',
  faltasRojo: 'dash_faltas_rojo',
  tardanzasAmbar: 'dash_tardanzas_ambar',
  tardanzasRojo: 'dash_tardanzas_rojo',
  metasAmbar: 'dash_metas_ambar_pct',
  metasRojo: 'dash_metas_rojo_pct',
} as const;

export const DEFAULTS_DASHBOARD: Record<string, number> = {
  dash_prenda_ambar_dias: 2,
  dash_prenda_rojo_dias: 4,
  dash_eval_ambar: 3,
  dash_eval_rojo: 8,
  dash_incid_ambar: 1,
  dash_incid_rojo: 3,
  dash_faltas_ambar: 1,
  dash_faltas_rojo: 3,
  dash_tardanzas_ambar: 2,
  dash_tardanzas_rojo: 5,
  dash_metas_ambar_pct: 70,
  dash_metas_rojo_pct: 40,
};

export type UmbralesDashboard = {
  atraso: Umbral;
  evaluar: Umbral;
  incidencias: Umbral;
  faltas: Umbral;
  tardanzas: Umbral;
  metas: Umbral;
};

function num(cfg: Record<string, string>, clave: string): number {
  const crudo = (cfg[clave] ?? '').trim().replace(',', '.');
  const n = crudo === '' ? NaN : Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULTS_DASHBOARD[clave];
}

/** Umbrales desde la tabla `config`; un valor vacío o inválido cae al default. */
export function umbralesDesdeConfig(cfg: Record<string, string>): UmbralesDashboard {
  const c = CLAVES_DASHBOARD;
  return {
    atraso: { ambar: num(cfg, c.atrasoAmbar), rojo: num(cfg, c.atrasoRojo) },
    evaluar: { ambar: num(cfg, c.evalAmbar), rojo: num(cfg, c.evalRojo) },
    incidencias: { ambar: num(cfg, c.incidAmbar), rojo: num(cfg, c.incidRojo) },
    faltas: { ambar: num(cfg, c.faltasAmbar), rojo: num(cfg, c.faltasRojo) },
    tardanzas: { ambar: num(cfg, c.tardanzasAmbar), rojo: num(cfg, c.tardanzasRojo) },
    metas: { ambar: num(cfg, c.metasAmbar), rojo: num(cfg, c.metasRojo) },
  };
}

/** Días enteros entre dos fechas 'YYYY-MM-DD' (hasta − desde). `hoy` lo da quien llama. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Suma `n` días (puede ser negativo) a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Las últimas `n` fechas terminando en `hoy`, de la más vieja a hoy. */
export function ultimosDias(hoy: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumarDias(hoy, i - (n - 1)));
}

export type PrendaAtraso = { etapa: string; dias: number };

/** Por etapa: cuántas prendas hay y cuántas pasan del umbral ámbar / rojo (días sin moverse). */
export function atrasoPorEtapa(prendas: PrendaAtraso[], u: Umbral) {
  const m = new Map<string, { total: number; ambar: number; rojo: number }>();
  for (const p of prendas) {
    const e = m.get(p.etapa) ?? { total: 0, ambar: 0, rojo: 0 };
    e.total += 1;
    const luz = luzMayorEsPeor(p.dias, u);
    if (luz === 'rojo') e.rojo += 1;
    else if (luz === 'ambar') e.ambar += 1;
    m.set(p.etapa, e);
  }
  return m;
}
