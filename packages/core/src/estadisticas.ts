// Estadísticas del negocio (S20) — helpers puros de rango y agrupación temporal, sin IO.
// Los RPCs de agregación entregan filas {fecha, valor}; el core las normaliza en series para
// los gráficos (día/semana/mes) y calcula variaciones periodo-contra-periodo. Testeable sin BD.

export type Rango = { desde: string; hasta: string }; // YYYY-MM-DD inclusive
export type Granularidad = 'dia' | 'semana' | 'mes';
export const GRANULARIDADES: Granularidad[] = ['dia', 'semana', 'mes'];

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Parsea 'YYYY-MM-DD' a un Date en UTC (evita corrimientos por zona horaria).
function parseUTC(fechaISO: string): Date {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

// Rango por defecto: últimos `dias` hasta hoy. Si viene desde > hasta, se ordenan.
export function normalizarRango(desde?: string, hasta?: string, dias = 30): Rango {
  const hoy = new Date();
  const fin = hasta ? parseUTC(hasta) : new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const ini = desde ? parseUTC(desde) : new Date(fin.getTime() - dias * 86400000);
  const [a, b] = ini.getTime() <= fin.getTime() ? [ini, fin] : [fin, ini];
  return { desde: iso(a), hasta: iso(b) };
}

// Cantidad de días (inclusive) que abarca un rango.
export function diasEnRango(r: Rango): number {
  return Math.round((parseUTC(r.hasta).getTime() - parseUTC(r.desde).getTime()) / 86400000) + 1;
}

// El rango inmediatamente anterior de la misma longitud (para comparativas).
export function rangoAnterior(r: Rango): Rango {
  const n = diasEnRango(r);
  const finPrev = new Date(parseUTC(r.desde).getTime() - 86400000);
  const iniPrev = new Date(finPrev.getTime() - (n - 1) * 86400000);
  return { desde: iso(iniPrev), hasta: iso(finPrev) };
}

// Clave de bucket de una fecha según granularidad:
//  · dia → 'YYYY-MM-DD'  · semana → lunes de esa semana (ISO)  · mes → 'YYYY-MM'
export function claveBucket(fechaISO: string, gran: Granularidad): string {
  const d = parseUTC(fechaISO);
  if (gran === 'mes') return fechaISO.slice(0, 7);
  if (gran === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
    return iso(new Date(d.getTime() - dow * 86400000));
  }
  return iso(d);
}

export type Punto = { clave: string; total: number };

// Agrupa filas {fecha, valor} en una serie ordenada por clave, sumando por bucket.
export function agruparSerie(rows: { fecha: string; valor: number }[], gran: Granularidad): Punto[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const k = claveBucket(r.fecha, gran);
    acc.set(k, (acc.get(k) ?? 0) + (Number(r.valor) || 0));
  }
  return [...acc.entries()].map(([clave, total]) => ({ clave, total: Math.round(total * 100) / 100 })).sort((a, b) => (a.clave < b.clave ? -1 : 1));
}

// Variación porcentual actual vs. previo. Sin base previa: 100% si hay actual, 0 si no.
export function variacionPct(actual: number, previo: number): number {
  if (previo === 0) return actual === 0 ? 0 : 100;
  return Math.round(((actual - previo) / Math.abs(previo)) * 1000) / 10;
}

// Participación de cada categoría sobre el total (para donuts/barras de composición).
export function participacion(porCategoria: Record<string, number>): { categoria: string; total: number; pct: number }[] {
  const suma = Object.values(porCategoria).reduce((s, n) => s + n, 0);
  return Object.entries(porCategoria)
    .map(([categoria, total]) => ({ categoria, total, pct: suma === 0 ? 0 : Math.round((total / suma) * 1000) / 10 }))
    .sort((a, b) => b.total - a.total);
}
