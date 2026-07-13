// Fechas en hora de Perú (America/Lima), independientes de la TZ del server.
// Centraliza el helper que estaba copiado en asistencias/pagos/devoluciones/reportes.

const TZ = 'America/Lima';

/** 'YYYY-MM-DD' de hoy en Lima. */
export function hoyPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** 'YYYY-MM' del mes actual en Lima. */
export function mesPeru(): string {
  return hoyPeru().slice(0, 7);
}

/** Fecha completa en español, capitalizada: "Viernes, 4 de julio de 2026". */
export function fechaLargaPeru(d: Date = new Date()): string {
  const s = new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: TZ }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Partes para la "etiqueta del día": { dia: '04', mes: 'JUL', anio: '2026' }. */
export function etiquetaDia(d: Date = new Date()): { dia: string; mes: string; anio: string } {
  const partes = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  }).formatToParts(d);
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { dia: de('day'), mes: de('month').replace('.', '').toUpperCase(), anio: de('year') };
}

/** Saludo según la hora de Lima. */
export function saludoPeru(d: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }).format(d),
  );
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Tiempo relativo corto en español: "ahora", "hace 5 min", "hace 3 h", "ayer", "28 jun". */
export function tiempoRelativo(iso: string, ahora: Date = new Date()): string {
  const entonces = new Date(iso.includes('T') ? iso : `${iso}T12:00:00-05:00`);
  const seg = Math.max(0, (ahora.getTime() - entonces.getTime()) / 1000);
  if (seg < 90) return 'ahora';
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86_400) return `hace ${Math.round(seg / 3600)} h`;
  if (seg < 172_800) return 'ayer';
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: TZ })
    .format(entonces)
    .replace('.', '');
}
