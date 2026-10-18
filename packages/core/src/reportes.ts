// reportes.ts — dominio del módulo Reportes FR-01 (reporte diario por turno M/T/C).
// Tipos genéricos del oficio + helpers de presentación. Sin dependencias (no importa del adapter).

export type TurnoReporte = 'M' | 'T' | 'C';

// M = Mañana, T = Tarde, C = Día completo (cuenta como M y T en el sistema viejo).
export const TURNO_LABEL: Record<TurnoReporte, string> = {
  M: 'Mañana',
  T: 'Tarde',
  C: 'Día completo',
};

export type Reporte = {
  id: string; // 'DD-MM-YY_TURNO-SEDE' (preserva el id del sistema viejo)
  sedeCod: string;
  turno: TurnoReporte;
  fecha: string; // YYYY-MM-DD
  encargadoId: string | null;
  encargadoNombre: string | null;
  evaluadorId: string | null;
  evaluadorNombre: string | null;
  puntaje: number;
  puntajeEval: number | null;
  actTotal: number;
  actDone: number;
  evaluado: boolean;
  bloqueado: boolean;
  noEvaluable: boolean;
  autoEnviado: boolean;
  estadoEnvio: EstadoEnvio;
  trabajadores: string[];
  createdAt: string;
};

// ── Estado de envío (Fase 4 tarea 4) ─────────────────────────────────────────
// Eje distinto de `evaluado`/`noEvaluable`: no dice si YA SE EVALUÓ, dice CÓMO llegó a existir.
//   enviado       — el usuario le dio a Enviar dentro del plazo.
//   no_enviado    — venció el plazo pero había un borrador con contenido: se persiste todo lo
//                   marcado (actividades, limpieza, extras, colaboradores) y queda evaluable.
//   sin_actividad — venció el plazo sin borrador (o vacío): no hay nada que evaluar. Es el
//                   `no_evaluable` histórico, renombrado para reflejar qué significa de verdad.
export type EstadoEnvio = 'enviado' | 'no_enviado' | 'sin_actividad';

export const ESTADO_ENVIO_LABEL: Record<EstadoEnvio, string> = {
  enviado: 'Enviado',
  no_enviado: 'No enviado',
  sin_actividad: 'Sin actividad',
};

export type ReporteActividad = {
  id: string;
  cod: string;
  nombre: string;
  cat: string | null;
  peso: number;
  realizada: boolean;
  calificacion: number | null;
  obs: string | null;
  obsEval: string | null;
};

export type ReporteExtra = {
  id: string;
  tipo: string;
  nombre: string;
  // Código del catálogo (actividades_config, categoria='EXT') — null en los extras "libres"
  // (escape hatch sin catálogo, Fase 5 tarea 3). Snapshot server-side, no lo decide el cliente.
  cod: string | null;
  cantidad: number;
  montoTotal: number;
  precioUnitario: number;
  // Puntos por unidad (catálogo 'por_puntos') y total (peso × cantidad, columna generada en BD).
  // 0 para remuneradas y libres. NO se muestra al usuario operativo (decisión del dueño) — solo
  // en /administracion y en la evaluación.
  pesoUnitario: number;
  puntosTotal: number;
  // true cuando no hubo catálogo que lo respalde (extra "libre"): precio/puntos quedan en 0 y el
  // admin lo revisa a mano (Fase 5 tarea 3 — "marcados para revisión", no se inventa un valor).
  revisar: boolean;
  detalle: string | null;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
};

export type ReporteDetalle = Reporte & {
  actividades: ReporteActividad[];
  extras: ReporteExtra[];
};

export type EstadoReporte = 'evaluado' | 'pendiente' | 'no_evaluable';

// Estado derivado para la UI (no se persiste). El viejo bloquea el reporte (bloqueado=1) al
// crearlo y lo desbloquea al evaluar (evaluado=1).
export function estadoReporte(r: Pick<Reporte, 'evaluado' | 'noEvaluable'>): EstadoReporte {
  if (r.evaluado) return 'evaluado';
  if (r.noEvaluable) return 'no_evaluable';
  return 'pendiente';
}

export const ESTADO_REPORTE_LABEL: Record<EstadoReporte, string> = {
  evaluado: 'Evaluado',
  pendiente: 'Pendiente de evaluación',
  no_evaluable: 'No evaluable',
};

// ── Estado combinado para el dashboard (Fase 6 tarea 1) ──────────────────────
// Un solo badge de color a partir de dos ejes que hoy viven por separado (estadoEnvio y
// evaluado): la actividad reciente del dashboard necesita UN estado, no dos apilados como en
// /administracion/reportes (Badge de estadoReporte + Badge aparte de "No enviado"). sin_actividad
// y no_enviado priman sobre evaluado porque describen CÓMO llegó a existir el reporte, no si ya
// se revisó — un reporte no_enviado evaluado igual necesita saltar a la vista como excepción.
export type EstadoActividad = 'ok' | 'por_evaluar' | 'no_enviado' | 'sin_actividad';

export function estadoActividadReporte(r: Pick<Reporte, 'estadoEnvio' | 'evaluado'>): EstadoActividad {
  if (r.estadoEnvio === 'sin_actividad') return 'sin_actividad';
  if (r.estadoEnvio === 'no_enviado') return 'no_enviado';
  return r.evaluado ? 'ok' : 'por_evaluar';
}

export const ESTADO_ACTIVIDAD_LABEL: Record<EstadoActividad, string> = {
  ok: 'Enviado y evaluado',
  por_evaluar: 'Por evaluar',
  no_enviado: 'No enviado',
  sin_actividad: 'Sin actividad',
};

// ── Catálogo de actividades (config por sede) ────────────────────────────────

export type ActividadConfig = {
  id: string;
  cod: string;
  nombre: string;
  categoria: string | null;
  tipoAct: string; // 'obligatoria' | 'por_puntos' | 'remunerada'
  peso: number;
  activa: boolean;
  turno: string; // 'ambos' | 'M' | 'T' | 'C' (o 'm'/'t'/'mañana'/'tarde' del viejo)
  frecuenciaDias: number; // 0/1 diaria · 2 día par · 7 semanal · 15 quincenal · 30 mensual
  diaSemana: string | null; // lista por comas en minúsculas: 'lunes,martes'
  apareceDia: number; // base para frecuencia 7 (cada-N-semanas) / 15 / 30
  acumula: boolean;
  precioUnitario: number;
  unidad: string | null;
  orden: number;
};

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Deriva la fecha (YYYY-MM-DD) desde el id 'DD-MM-YY_TURNO-SEDE'. Única fuente de verdad de la
// fecha (no se confía en el reloj). Devuelve null si el id no matchea el formato.
export function fechaDesdeId(id: string): string | null {
  const m = String(id ?? '').match(/^(\d{2})-(\d{2})-(\d{2})_/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const fullYear = parseInt(yy, 10) < 70 ? `20${yy}` : `19${yy}`;
  return `${fullYear}-${mm}-${dd}`;
}

// Construye el id 'DD-MM-YY_TURNO-SEDE' desde una fecha YYYY-MM-DD.
export function idReporte(fecha: string, turno: TurnoReporte, sede: string): string {
  const [yyyy, mm, dd] = fecha.split('-');
  return `${dd}-${mm}-${yyyy.slice(2)}_${turno}-${sede}`;
}

// ¿La actividad del catálogo aplica en esta fecha/turno? Portado fiel de routes/actividades.js
// (actAplicaHoy). C (día completo) cuenta como M y T → nunca filtra por turno.
export function actAplicaHoy(
  a: Pick<ActividadConfig, 'turno' | 'frecuenciaDias' | 'diaSemana' | 'apareceDia'>,
  fecha: string,
  turno: TurnoReporte | '',
): boolean {
  const d = new Date(`${fecha}T12:00:00`);
  const diaDelMes = d.getDate();
  const diaSemana = DIAS_SEMANA[d.getDay()];

  const actTurno = (a.turno || 'ambos').toLowerCase();
  if (actTurno !== 'ambos') {
    const t = (turno || '').toUpperCase();
    if (t === 'M' && actTurno !== 'm' && actTurno !== 'mañana') return false;
    if (t === 'T' && actTurno !== 't' && actTurno !== 'tarde') return false;
  }

  const freq = Number(a.frecuenciaDias) || 0;
  if (freq <= 1) return true;
  if (freq === 2) return diaDelMes % 2 === 0;
  if (freq === 7) {
    if (!a.diaSemana) return true;
    const diaOk = a.diaSemana
      .toLowerCase()
      .split(',')
      .map((x) => x.trim())
      .includes(diaSemana);
    if (!diaOk) return false;
    const cadaSemanas = Number(a.apareceDia) || 1;
    if (cadaSemanas <= 1) return true;
    const weekNum = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    return weekNum % cadaSemanas === 0;
  }
  if (freq === 15) {
    const diaBase = Number(a.apareceDia) || 1;
    return diaDelMes === diaBase || diaDelMes === diaBase + 15;
  }
  if (freq === 30) {
    const diaM = Number(a.apareceDia) || 1;
    return diaDelMes === diaM;
  }
  return true;
}

// Exclusividad de turno: si ya se hizo el reporte de la mañana, no se puede volver a hacer
// mañana ni "día completo" (C se solapa con M y T); análogo para tarde. Devuelve, para un turno
// NUEVO a crear, qué otros turnos (ya existentes) lo bloquearían.
export function turnosQueBloquean(turno: TurnoReporte): TurnoReporte[] {
  if (turno === 'C') return ['M', 'T'];
  return ['C'];
}

// ── Cobertura de turnos del día (Fase 6 tarea 2) ─────────────────────────────
// Estado de UN turno lógico (M o T) de UNA sede, mirando los reportes YA CREADOS hoy para esa
// sede — es lo que arma la matriz sede×turno del dashboard ("qué falta hoy" de un vistazo). Un
// reporte 'C' (día completo) cubre M y T a la vez (mismo criterio que turnosQueBloquean). Pura:
// no lee la hora del sistema ni la BD, recibe los minutos hasta el cierre ya calculados
// (minutosHastaCierre) para poder testearse sin mocks, igual que el resto de este archivo.
//   cubierto     — hay un reporte 'enviado' que cubre el turno.
//   no_enviado   — venció con un borrador con contenido, sin nadie darle a Enviar.
//   sin_reportar — venció sin nada en absoluto (ni fila en la tabla, ni borrador): la alerta real.
//   en_curso     — el turno todavía no vence: normal que no haya nada todavía, no es una alerta.
export type EstadoCobertura = 'cubierto' | 'no_enviado' | 'sin_reportar' | 'en_curso';

export function coberturaTurno(
  turnoLogico: 'M' | 'T',
  reportesHoySede: Pick<Reporte, 'turno' | 'estadoEnvio'>[],
  minutosHastaCierreTurno: number,
): EstadoCobertura {
  const candidatos = reportesHoySede.filter((r) => r.turno === turnoLogico || r.turno === 'C');
  if (candidatos.some((r) => r.estadoEnvio === 'enviado')) return 'cubierto';
  if (candidatos.some((r) => r.estadoEnvio === 'no_enviado')) return 'no_enviado';
  if (candidatos.length > 0) return 'sin_reportar'; // los que hay son todos 'sin_actividad'
  return minutosHastaCierreTurno > 0 ? 'en_curso' : 'sin_reportar';
}

export const ESTADO_COBERTURA_LABEL: Record<EstadoCobertura, string> = {
  cubierto: 'Cubierto',
  no_enviado: 'No enviado',
  sin_reportar: 'Sin reportar',
  en_curso: 'En curso',
};

// Puntaje 0-100 de un reporte evaluado: Σ(peso×calificación)/Σ(peso) × 100, redondeado.
// calificación ∈ [0,1] (1 = perfecto). Portado de public/js/app.js (triggerEnviarEval).
export function calcularPuntajeEval(items: { peso: number; calificacion: number }[]): number {
  let total = 0;
  let max = 0;
  for (const it of items) {
    total += it.peso * it.calificacion;
    max += it.peso;
  }
  return max > 0 ? Math.round((total / max) * 100) : 0;
}

// ── Resumen de limpieza (decisión del dueño, 17-oct-2026) ────────────────────
// El 100 % son SOLO las zonas del turno del reporte (turno C = todas). Las zonas del otro turno que se
// limpian suman como extra encima: el porcentaje puede pasar de 100 (50/43,1 = 116 %).
// Spec: docs/superpowers/specs/reportes/2026-10-17-limpieza-extras-design.md
export type ZonaLimpieza = { cod: string; peso: number; tipo: string; turno: string };

function zonaAplicaAlTurno(zTurno: string, turno: TurnoReporte): boolean {
  const z = (zTurno || 'ambos').toLowerCase();
  if (turno === 'C') return true;
  if (turno === 'M') return z === 'ambos' || z === 'mañana';
  return z === 'ambos' || z === 'tarde';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// `calificaciones`: cod de zona → calificación 0..1 (1 = limpia). Al crear el reporte, toda zona marcada vale 1.
export function resumenLimpieza(
  zonas: ZonaLimpieza[],
  calificaciones: Record<string, number>,
  turno: TurnoReporte,
): { propiosTot: number; propiosGot: number; extraGot: number; pct: number } {
  let propiosTot = 0;
  let propiosGot = 0;
  let extraGot = 0;
  for (const z of zonas) {
    if (z.tipo === 'area') continue;
    const ganado = z.peso * (calificaciones[z.cod] ?? 0);
    if (zonaAplicaAlTurno(z.turno, turno)) {
      propiosTot += z.peso;
      propiosGot += ganado;
    } else {
      extraGot += ganado;
    }
  }
  const pct = propiosTot > 0 ? Math.round(((propiosGot + extraGot) / propiosTot) * 100) : 0;
  return { propiosTot: r1(propiosTot), propiosGot: r1(propiosGot), extraGot: r1(extraGot), pct };
}

// ── Cuenta regresiva del turno (Fase 4 tarea 5) ──────────────────────────────
// Minutos restantes hasta la hora de cierre (formato 'HH:MM', hora Perú) del turno activo, a
// partir de un instante dado. Negativo si el cierre ya pasó. Pura: no lee el reloj del sistema
// (recibe `ahora`) para poder testearse sin mocks — la usa el contador de la barra sticky del
// formulario. Réplica del cálculo de public/js/header.js:36-89 (calcTurnoActual/fmtRestante) pero
// contra un cierre único configurable en vez del rango [inicio,fin) fijo del sistema viejo.
export function minutosHastaCierre(ahora: Date, horaCierreHHMM: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const horaAhora = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const minAhora = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  const [hc, mc] = horaCierreHHMM.split(':').map((x) => Number(x) || 0);
  return hc * 60 + mc - (horaAhora * 60 + minAhora);
}

// Formato corto en español, como el header.js viejo: "cierra en 1h 30m" / "cierra en 8m".
export function formatoCierre(minutos: number): string {
  if (minutos <= 0) return 'turno cerrado';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `cierra en ${h}h ${m}m` : `cierra en ${m}m`;
}

// ── Solapes del layout de limpieza (Fase 5 tarea 2) ──────────────────────────
// El lienzo posiciona cada zona con posX/posY/ancho/alto en px absolutos (LIENZO_W×LIENZO_H,
// ver layout-map.tsx). Dos zonas con nivel/sobreCod (p. ej. un maniquí "sobre" una mesa) pueden
// pintarse una encima de otra a propósito, pero cuando el solape NO está declarado así, la de
// abajo queda inalcanzable al clic (mismo z-index, gana la que esté después en el DOM). Estas
// funciones son puras (solo geometría) para poder testearlas sin el DOM; la UI las usa para (a)
// agrupar "zonas ocultas en este punto" en el desplegable del mapa y (b) avisar al guardar en el
// editor de layout.

export type ZonaRect = { cod: string; posX: number; posY: number; ancho: number; alto: number };

// AABB overlap: exige solape de ÁREA real (tocar solo el borde no cuenta).
function rectsSolapan(a: ZonaRect, b: ZonaRect): boolean {
  return (
    a.posX < b.posX + b.ancho &&
    a.posX + a.ancho > b.posX &&
    a.posY < b.posY + b.alto &&
    a.posY + a.alto > b.posY
  );
}

// Todos los pares (cod, cod) cuyo rectángulo se solapa, sin importar nivel/sobreCod — es lo que
// necesita el mapa para saber qué zonas agrupar en el desplegable de un punto dado (toggle() debe
// poder alcanzar CUALQUIER zona debajo, esté o no "declarado" el solape).
export function zonasSolapadas(zonas: ZonaRect[]): [string, string][] {
  const pares: [string, string][] = [];
  for (let i = 0; i < zonas.length; i++) {
    for (let j = i + 1; j < zonas.length; j++) {
      if (rectsSolapan(zonas[i], zonas[j])) pares.push([zonas[i].cod, zonas[j].cod]);
    }
  }
  return pares;
}

export type ZonaRectNivel = ZonaRect & { nivel?: string | null; sobreCod?: string | null };

// Igual que zonasSolapadas, pero descarta los pares ya EXPLICADOS por la relación nivel/sobreCod
// declarada en el editor (una zona 'sobre' cuyo sobreCod apunta exactamente al mueble que ocupa:
// eso es intencional, no un error de posicionamiento). Lo usa el editor de layout para avisar al
// guardar — solo de los solapes que probablemente sean un accidente de arrastre.
export function zonasSolapadasInesperadas(zonas: ZonaRectNivel[]): [string, string][] {
  const porCod = new Map(zonas.map((z) => [z.cod, z]));
  return zonasSolapadas(zonas).filter(([codA, codB]) => {
    const a = porCod.get(codA);
    const b = porCod.get(codB);
    if (!a || !b) return true;
    const explicado =
      (a.nivel === 'sobre' && a.sobreCod === b.cod) || (b.nivel === 'sobre' && b.sobreCod === a.cod);
    return !explicado;
  });
}
