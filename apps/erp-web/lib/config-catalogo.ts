// config-catalogo.ts — Fase 13 tarea 1: catálogo TIPADO de los parámetros que el sistema ya
// conoce (pts_* del pipeline, peso_*/eval_* de evaluación, turno_*_cierre de reportes,
// despiece_pct_saco de inventario, valores_* de Valores 360°). Es la fuente de verdad de
// tipo/descripción/sección/valor-por-defecto para /configuracion — reemplaza el agrupado por
// PREFIJO de string que hacía app/configuracion/cliente.tsx (`grupo()`/`etiqueta()` viejos, que
// además no distinguían tipo de control ni mostraban default).
//
// Vive en código, no en la tabla `config` (ver comentario en la migración 0058): así la
// descripción de cada parámetro queda versionada junto al código que la usa, sin dos fuentes
// (SQL y TS) pudiendo desincronizarse. Los parámetros que el ADMIN cree desde la UI (no están
// aquí) sí guardan su tipo/descripción en las columnas nuevas de `config` — ver config-repo.ts.

export type ConfigTipo = 'numero' | 'booleano' | 'texto' | 'lista' | 'color' | 'horario';

export type ConfigCatalogoItem = {
  clave: string;
  seccion: string;
  etiqueta: string;
  descripcion: string;
  tipo: ConfigTipo;
  default: string;
  opciones?: string[]; // solo si tipo === 'lista'
  min?: number;
  max?: number;
  step?: number; // solo si tipo === 'numero'
};

const SECCION_PUNTOS = 'Puntos del pipeline';
const SECCION_EVALUACION = 'Evaluación mensual';
const SECCION_REPORTES = 'Reportes de turno';
const SECCION_INVENTARIO = 'Inventario';
const SECCION_VALORES = 'Valores 360°';

// Orden de aparición de las secciones en /configuracion (las secciones sin ningún item presente
// simplemente no se muestran; "Personalizados" — parámetros creados por el admin — va siempre al
// final, ver config-repo.ts).
export const ORDEN_SECCIONES = [
  SECCION_PUNTOS,
  SECCION_EVALUACION,
  SECCION_REPORTES,
  SECCION_INVENTARIO,
  SECCION_VALORES,
];

// Puntos de productividad (packages/core/src/puntos.ts::ClavePuntos) — 9 claves, todas
// "puntos que suma el operario al completar la etapa X". Una pieza que no es terno completo suma
// la mitad (regla confirmada E1, ver puntosDeEtapa() en el core) — no depende de config.
function ptsItem(clave: string, etiqueta: string, def: string): ConfigCatalogoItem {
  return {
    clave,
    seccion: SECCION_PUNTOS,
    etiqueta,
    descripcion: `Puntos que suma el operario al completar la etapa "${etiqueta}" del pipeline de lavandería. Una pieza que no es terno completo suma la mitad de este valor.`,
    tipo: 'numero',
    default: def,
    min: 0,
    step: 0.5,
  };
}

// Pesos de la nota mensual (packages/core/src/evaluaciones.ts::PESOS_DEFAULT) — fracción 0-1,
// deberían sumar 1.0 entre los 7 (la app no lo fuerza; ver EVAL_PESOS_DEFAULT del sistema viejo).
function pesoItem(clave: string, etiqueta: string, def: string): ConfigCatalogoItem {
  return {
    clave,
    seccion: SECCION_EVALUACION,
    etiqueta: `Peso: ${etiqueta}`,
    descripcion: `Peso del componente "${etiqueta}" en la nota mensual final (escala /20). Los pesos de todos los componentes deberían sumar 1.0 entre sí.`,
    tipo: 'numero',
    default: def,
    min: 0,
    max: 1,
    step: 0.01,
  };
}

export const CONFIG_CATALOGO: ConfigCatalogoItem[] = [
  // ── Puntos del pipeline (packages/core/src/puntos.ts) ──────────────────────────────────────
  ptsItem('pts_lavado_normal', 'Lavado normal', '1'),
  ptsItem('pts_lavado_seco', 'Lavado en seco', '3'),
  ptsItem('pts_lavado_especializado', 'Lavado especializado', '5'),
  ptsItem('pts_empatado', 'Empatado', '0.5'),
  ptsItem('pts_refaccion', 'Refacción', '2'),
  ptsItem('pts_compostura', 'Compostura / codificación', '5'),
  ptsItem('pts_planchado', 'Planchado', '3'),
  ptsItem('pts_control_calidad', 'Control de calidad', '2'),
  ptsItem('pts_accesorio', 'Accesorio', '0.5'),

  // ── Evaluación mensual (packages/core/src/evaluaciones.ts) ─────────────────────────────────
  pesoItem('peso_competencias', 'Competencias', '0.25'),
  pesoItem('peso_valores', 'Valores 360°', '0.25'),
  pesoItem('peso_operaciones', 'Operaciones (puntos del pipeline)', '0.10'),
  pesoItem('peso_software', 'Software', '0.10'),
  pesoItem('peso_limpieza', 'Limpieza', '0.10'),
  pesoItem('peso_examenes', 'Exámenes', '0.15'),
  pesoItem('peso_tardanza', 'Puntualidad (descuento)', '0.05'),
  {
    clave: 'eval_tardanza_min_por_punto',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Minutos de tardanza por punto descontado',
    descripcion:
      'Minutos de tardanza acumulada en el mes que restan 1 punto de la nota final (escala /20). Ej.: con 15, acumular 30 min de tardanza resta 2 puntos.',
    tipo: 'numero',
    default: '15',
    min: 1,
    step: 1,
  },
  {
    clave: 'eval_bonus_ventas_max',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Tope del bono manual por ventas',
    descripcion:
      'Tope máximo del bono por cumplimiento de metas de venta que se suma a la nota final (/20). El bono en sí se sigue cargando a mano en /evaluaciones (el módulo de metas de venta del sistema viejo no se migró — ver docs/pendientes-negocio.md).',
    tipo: 'numero',
    default: '2',
    min: 0,
    step: 0.5,
  },

  // ── Reportes de turno (Fase 4, migración 0052 — pendiente de aplicar) ──────────────────────
  {
    clave: 'turno_m_cierre',
    seccion: SECCION_REPORTES,
    etiqueta: 'Hora de cierre — turno Mañana',
    descripcion:
      'Hora límite para enviar el reporte del turno Mañana. Después de esta hora, el sistema lo marca "no enviado" conservando lo que se alcanzó a llenar. Default heredado del sistema viejo, no confirmado por el dueño.',
    tipo: 'horario',
    default: '15:00',
  },
  {
    clave: 'turno_t_cierre',
    seccion: SECCION_REPORTES,
    etiqueta: 'Hora de cierre — turno Tarde',
    descripcion:
      'Hora límite para enviar el reporte del turno Tarde. Default heredado del sistema viejo, no confirmado por el dueño.',
    tipo: 'horario',
    default: '23:00',
  },
  {
    clave: 'turno_c_cierre',
    seccion: SECCION_REPORTES,
    etiqueta: 'Hora de cierre — turno Corrido',
    descripcion:
      'Hora límite para enviar el reporte del turno Corrido. Default heredado del sistema viejo, no confirmado por el dueño.',
    tipo: 'horario',
    default: '23:00',
  },

  // ── Inventario (Fase 7, migración 0055 — pendiente de aplicar) ─────────────────────────────
  {
    clave: 'despiece_pct_saco',
    seccion: SECCION_INVENTARIO,
    etiqueta: 'Reparto de precio al despiezar — % del saco',
    descripcion:
      'Porcentaje del precio del terno completo que se asigna al saco al despiezarlo en saco + pantalón (el resto va al pantalón). Ej.: 0.6 = 60% saco / 40% pantalón. Valor de ejemplo, NO confirmado por el dueño.',
    tipo: 'numero',
    default: '0.6',
    min: 0,
    max: 1,
    step: 0.01,
  },

  // ── Valores 360° (Fase 13 tarea 3, migración 0058) ─────────────────────────────────────────
  {
    clave: 'valores_habilitado',
    seccion: SECCION_VALORES,
    etiqueta: 'Módulo habilitado',
    descripcion:
      'Habilita el módulo de Valores 360° (evaluar compañeros). Si se apaga, nadie puede enviar evaluaciones nuevas, aunque el historial y los promedios ya guardados se siguen viendo.',
    tipo: 'booleano',
    default: 'true',
  },
  {
    clave: 'valores_modo',
    seccion: SECCION_VALORES,
    etiqueta: 'Cuándo se puede evaluar',
    descripcion:
      '"Siempre": se puede evaluar cualquier día del mes (comportamiento actual). "Ventana": solo entre el día de inicio y el día de fin configurados abajo — el sistema viejo lo restringía así.',
    tipo: 'lista',
    opciones: ['siempre', 'ventana'],
    default: 'siempre',
  },
  {
    clave: 'valores_dia_inicio',
    seccion: SECCION_VALORES,
    etiqueta: 'Ventana: día de inicio',
    descripcion: 'Día del mes (1-31) en que se abre la ventana de evaluación, si "Cuándo se puede evaluar" está en modo Ventana.',
    tipo: 'numero',
    default: '1',
    min: 1,
    max: 31,
    step: 1,
  },
  {
    clave: 'valores_dia_fin',
    seccion: SECCION_VALORES,
    etiqueta: 'Ventana: día de fin',
    descripcion: 'Día del mes (1-31) en que se cierra la ventana de evaluación, si "Cuándo se puede evaluar" está en modo Ventana.',
    tipo: 'numero',
    default: '31',
    min: 1,
    max: 31,
    step: 1,
  },
];

export const CONFIG_CATALOGO_MAP: Map<string, ConfigCatalogoItem> = new Map(CONFIG_CATALOGO.map((i) => [i.clave, i]));

// Humaniza una clave que NO está en el catálogo (parámetro personalizado sin etiqueta propia
// todavía, o fila legacy): "mi_clave_nueva" → "mi clave nueva".
export function etiquetaDesdeClave(clave: string): string {
  return clave.replace(/_/g, ' ');
}

// ── ConfigItem + ordenarSecciones ──────────────────────────────────────────────────────────────
// Viven ACÁ (no en config-repo.ts) a propósito: este archivo no importa nada de servidor (sin
// getServerClient/next-headers), así que app/configuracion/cliente.tsx (componente 'use client')
// puede importar el TIPO y esta función pura sin arrastrar next/headers al bundle del navegador —
// ese exacto error tumbó /configuracion la primera vez que se escribió esta fase.
//
// Un ConfigItem mezcla dos fuentes:
//  · Parámetros del CATÁLOGO (arriba): tipo/descripción/sección/default vienen del código, el
//    valor real (si ya se guardó alguna vez) viene de la tabla `config`. Si todavía no hay fila en
//    la base (migración de esa clave sin aplicar, o nunca se guardó), `guardado` queda en false y
//    `valor` cae al default del catálogo — así el parámetro YA es visible y editable antes de que
//    exista la fila, y guardar lo inserta.
//  · Parámetros PERSONALIZADOS (creados desde /configuracion, no están en el catálogo): tipo/
//    descripción/sección salen de las columnas nuevas de `config` (migración 0058). Si esas
//    columnas todavía no existen (migración sin aplicar), caen a 'texto'/'Personalizados'.
export type ConfigItem = {
  clave: string;
  valor: string;
  tipo: ConfigTipo;
  seccion: string;
  etiqueta: string;
  descripcion: string;
  default: string | null; // null para personalizados (no hay "valor de fábrica" que restaurar)
  opciones?: string[];
  min?: number;
  max?: number;
  step?: number;
  guardado: boolean; // false = todavía no hay fila en `config` (se está mostrando el default)
  esPersonalizado: boolean;
};

// Orden de secciones para la UI: catálogo en su orden fijo, luego cualquier sección personalizada
// (alfabético), con "Personalizados" siempre al final de todas.
export function ordenarSecciones(items: ConfigItem[]): { nombre: string; items: ConfigItem[] }[] {
  const nombres = new Set(items.map((i) => i.seccion));
  const catalogadas = ORDEN_SECCIONES.filter((s) => nombres.has(s));
  const otras = [...nombres].filter((s) => !ORDEN_SECCIONES.includes(s) && s !== 'Personalizados').sort();
  const orden = [...catalogadas, ...otras, ...(nombres.has('Personalizados') ? ['Personalizados'] : [])];
  return orden.map((nombre) => ({ nombre, items: items.filter((i) => i.seccion === nombre) }));
}
