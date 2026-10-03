// El período que comparten todas las secciones del módulo de colaboradores.
//
// POR QUÉ VIVE EN LA URL Y NO EN UN ESTADO DE REACT. El módulo tiene siete secciones y se navega
// entre ellas todo el tiempo. Si el período fuera estado del cliente, cambiar de sección lo
// perdería o habría que subirlo a un contexto que atraviese layouts de servidor. En la URL viaja
// solo: cada sección lo lee de sus searchParams, un enlace lo conserva, y el administrador puede
// mandarle a alguien la dirección de lo que está mirando.
//
// Las fechas son hora Perú (no-negociable 4): el default sale de hoyPeru(), nunca de new Date().

import { resolverRango, type VistaRango } from '@scilb/core';
import { hoyPeru } from './fechas';

export type Periodo = { desde: string; hasta: string };

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Primer y último día del mes calendario de `hoy` ('YYYY-MM-DD'). */
export function mesCalendario(hoy: string): Periodo {
  const [y, m] = hoy.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * Lee el período de los searchParams de una sección.
 *
 * Sin parámetros —o con basura— cae al mes calendario en curso. Se normaliza el orden: si alguien
 * edita la dirección y deja `hasta` antes que `desde`, se dan vuelta en vez de devolver un rango
 * vacío que la pantalla mostraría como "no hay nada", que es la lectura equivocada.
 */
export function leerPeriodo(sp: Record<string, string | string[] | undefined> | undefined): Periodo {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const d = uno(sp?.desde);
  const h = uno(sp?.hasta);
  const base = mesCalendario(hoyPeru());
  const desde = d && ES_FECHA.test(d) ? d : base.desde;
  const hasta = h && ES_FECHA.test(h) ? h : base.hasta;
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

/** Días de calendario que cubre el período, ambos extremos incluidos. */
export function diasDelPeriodo(p: Periodo): number {
  const a = Date.parse(`${p.desde}T00:00:00Z`);
  const b = Date.parse(`${p.hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** "1 – 19 de agosto de 2026" · "28 jul – 27 ago de 2026" cuando cruza de mes. */
export function etiquetaPeriodo(p: Periodo): string {
  const fmt = (iso: string, conMes: boolean) => {
    const d = new Date(`${iso}T12:00:00-05:00`);
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      ...(conMes ? { month: 'long' } : {}),
      timeZone: 'America/Lima',
    }).format(d);
  };
  const mismoMes = p.desde.slice(0, 7) === p.hasta.slice(0, 7);
  const anio = p.hasta.slice(0, 4);
  return mismoMes
    ? `${fmt(p.desde, false)} – ${fmt(p.hasta, true)} de ${anio}`
    : `${fmt(p.desde, true)} – ${fmt(p.hasta, true)} de ${anio}`;
}

/** El período como query string, para que un enlace entre secciones no lo pierda. */
export function queryPeriodo(p: Periodo): string {
  return `desde=${p.desde}&hasta=${p.hasta}`;
}

/**
 * Vista y rango de una pantalla que se mira por día, semana, mes o rango
 * (spec asistencias/2026-10-03-filtros-rango-design.md). Viajan en la URL como
 * `?vista=…&desde=…&hasta=…`; la lógica vive en el core (`resolverRango`) y acá sólo se le pasa
 * el hoy de Perú. `porDefecto: null` deja que la pantalla decida qué mostrar sin rango.
 */
export function leerVistaRango(
  sp: Record<string, string | string[] | undefined> | URLSearchParams | undefined,
  porDefecto: VistaRango | null,
): { vista: VistaRango; rango: Periodo } | null {
  const uno = (k: string) => {
    if (sp instanceof URLSearchParams) return sp.get(k);
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return resolverRango({ vista: uno('vista'), desde: uno('desde'), hasta: uno('hasta') }, hoyPeru(), porDefecto);
}
