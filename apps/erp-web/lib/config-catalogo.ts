import { ESCALAS_SUELDO_DEFAULT } from '@scilb/core';
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
  /** Un número que puede quedar en blanco: en blanco significa «desactivado», no «falta el dato». */
  permiteVacio?: boolean;
  /**
   * Sólo si tipo === 'numero'. `porcentaje`: se guarda la fracción (`0.015`) pero /configuracion la
   * muestra y la pide en porcentaje (`1.5`). `min`/`max` siguen hablando de la fracción guardada.
   * Spec: docs/superpowers/specs/sueldos/2026-10-03-comision-en-porcentaje-design.md
   */
  unidad?: 'porcentaje';
};

const SECCION_PUNTOS = 'Puntos del pipeline';
const SECCION_EVALUACION = 'Evaluación mensual';
const SECCION_REPORTES = 'Reportes de turno';
const SECCION_INVENTARIO = 'Inventario';
const SECCION_VALORES = 'Valores 360°';
const SECCION_POS = 'Caja y POS';
const SECCION_SUELDOS = 'Sueldos';
const SECCION_CODIGO = 'Código personal';
/** Sección con tarjeta propia en /configuracion (app/configuracion/cliente.tsx). */
export const SECCION_PAGO_PUNTOS = 'Pago por puntos';
export const CLAVE_PUNTOS_META = 'sueldo_puntos_meta_mensual';
export const CLAVE_SOLES_POR_PUNTO = 'sueldo_soles_por_punto';
const SECCION_ACCESO = 'Acceso';
const SECCION_ESCALAS = 'Escalas salariales';
const SECCION_INGRESO = 'Ingreso de personal';
const SECCION_CAPACITACION = 'Capacitación';

// Orden de aparición de las secciones en /configuracion (las secciones sin ningún item presente
// simplemente no se muestran; "Personalizados" — parámetros creados por el admin — va siempre al
// final, ver config-repo.ts).
export const ORDEN_SECCIONES = [
  SECCION_PUNTOS,
  SECCION_EVALUACION,
  SECCION_SUELDOS,
  SECCION_ESCALAS,
  SECCION_PAGO_PUNTOS,
  SECCION_REPORTES,
  SECCION_INVENTARIO,
  SECCION_POS,
  SECCION_VALORES,
  SECCION_CODIGO,
  SECCION_CAPACITACION,
  SECCION_INGRESO,
  SECCION_ACCESO,
];

// Puntos de productividad — 10 claves, todas "puntos que suma el operario al completar la etapa
// X". Una pieza que no es terno completo suma la mitad (regla confirmada E1; la regla vigente es
// puntosAvance() de packages/core/src/pipeline.ts, replicada en plpgsql dentro de
// pipeline_avanzar) — no depende de config.
// OJO: el tipo ClavePuntos de packages/core/src/puntos.ts enumera sólo 9 y no incluye
// 'pts_recepcion'; ese archivo no calcula nada en producción (lo dice su propia cabecera) y este
// catálogo es la lista completa de las claves pts_* que `pipeline_avanzar` busca en config.
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

// Escalas salariales (ticket 35): tarifa por hora y antigüedad de cada escala. Defaults del Excel
// del dueño (packages/core/src/sueldos.ts::ESCALAS_SUELDO_DEFAULT); sólo SUGIEREN, el admin confirma.
function escalaItems(): ConfigCatalogoItem[] {
  return ESCALAS_SUELDO_DEFAULT.flatMap((e) => [
    {
      clave: `escala_${e.escala}_tarifa_hora`,
      seccion: SECCION_ESCALAS,
      etiqueta: `Escala ${e.escala}: pago por hora (S/)`,
      descripcion: `Soles por hora de la escala ${e.escala}. Con ella se sugiere el sueldo del contrato; el administrador decide.`,
      tipo: 'numero' as const,
      default: String(e.tarifaHora),
      min: 0,
      step: 0.1,
    },
    {
      clave: `escala_${e.escala}_desde_mes`,
      seccion: SECCION_ESCALAS,
      etiqueta: `Escala ${e.escala}: desde qué mes`,
      descripcion: `Meses completos de antigüedad desde los que se sugiere la escala ${e.escala} (0 = primer mes). Tramo por confirmar con el dueño.`,
      tipo: 'numero' as const,
      default: String(e.desdeMes),
      min: 0,
      step: 1,
    },
  ]);
}

export const CONFIG_CATALOGO: ConfigCatalogoItem[] = [
  // ── Puntos del pipeline (packages/core/src/puntos.ts) ──────────────────────────────────────
  // `pts_recepcion` se sembró recién con la migración 0089: faltaba en la base y en este
  // catálogo, así que `pipeline_avanzar` caía a su default interno de 1 y el peso de la etapa
  // no se podía editar desde ninguna pantalla. El default sigue siendo 1 justamente para no
  // cambiar ningún cálculo ya hecho (39 filas de pipeline_puntos con etapa='recepcion').
  ptsItem('pts_recepcion', 'Recepción', '1'),
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

  // ── Puntos como moneda (Fase 25-ago-2026, migración 0095, spec docs/superpowers/specs/
  // evaluaciones/2026-08-25-puntos-como-moneda-design.md §5) — la nota mensual además se puede
  // leer desde los puntos acumulados del período (notaDesdePuntos(), packages/core/src/
  // evaluaciones.ts), en vez de sólo el promedio ponderado de arriba. Los 5 primeros son la recta
  // quebrada + las bandas; los últimos 2 son las dos fuentes de puntos nuevas que suma el RPC
  // private.evaluacion_componentes_datos. NINGUNO está confirmado por el administrador: son los
  // ejemplos textuales que él mismo marcó como provisionales — ver docs/pendientes-negocio.md.
  {
    clave: 'eval_puntos_promedio',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Puntos del período que son "el promedio"',
    descripcion:
      'Cuántos puntos acumulados en el período equivalen a la nota de "Nota que corresponde al promedio" de abajo. Ejemplo textual del administrador ("por ejemplo: 5000"), no un número confirmado.',
    tipo: 'numero',
    default: '5000',
    min: 0,
    step: 1,
  },
  {
    clave: 'eval_nota_promedio',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Nota que corresponde al promedio',
    descripcion:
      'La nota /20 que recibe quien llega exactamente a "Puntos del período que son el promedio". El administrador dio 16 como ejemplo.',
    tipo: 'numero',
    default: '16',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    clave: 'eval_puntos_excelente',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Puntos del período que son "excelente" (nota 20)',
    descripcion:
      'Cuántos puntos acumulados en el período dan nota 20 ("excelente o perfección", palabras del administrador). Pasar de este número sigue subiendo la nota más allá de 20 — así se define "sobresaliente". Ejemplo textual, no confirmado ("por ejemplo: 7500").',
    tipo: 'numero',
    default: '7500',
    min: 0,
    step: 1,
  },
  {
    clave: 'eval_banda_riesgo',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Nota bajo la cual es "riesgo de despido"',
    descripcion:
      'Por debajo de esta nota /20, la pantalla marca a la persona en la banda "Riesgo". Es sólo una etiqueta informativa: no dispara ninguna acción sola. Palabra del administrador: "<13 riesgo de despido".',
    tipo: 'numero',
    default: '13',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    clave: 'eval_banda_ideal',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Nota desde la cual es "ideal"',
    descripcion:
      'Desde esta nota /20 (y hasta 20) la banda es "Ideal". Por encima de 20 pasa a ser "Sobresaliente" — ese corte no es editable, es la nota máxima en sí misma. Palabra del administrador: ">18 ideal y perfección".',
    tipo: 'numero',
    default: '18',
    min: 0,
    max: 20,
    step: 0.5,
  },
  {
    clave: 'pts_actividad_cumplida',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Puntos por actividad cumplida (reportes)',
    descripcion:
      'Puntos que suma cada actividad de un reporte de turno (limpieza, software, operaciones), multiplicados por su calificación (0 a 1: media calificación, medio punto). Default deliberadamente conservador — el administrador dijo que las actividades dan puntos pero no cuántos; subilo si un turno bien hecho debería pesar más frente al promedio del período.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'pts_por_sol_vendido',
    seccion: SECCION_EVALUACION,
    etiqueta: 'Puntos por cada sol vendido',
    descripcion:
      'Cuántos puntos vale cada sol de venta registrada, para que quien vende y no toca el pipeline también pueda acumular puntos. VACÍO A PROPÓSITO: nadie confirmó cuánto vale una venta frente al trabajo del pipeline (el administrador dio media referencia: "si planchar 100 prendas vale 1000"). Con la clave vacía, las ventas suman 0 puntos y la pantalla avisa que falta definir esto — no se inventa un número.',
    tipo: 'numero',
    default: '',
    min: 0,
    step: 0.5,
    // Vacío a propósito (0095). Sin esto, guardar /configuracion exigía inventar la tasa.
    permiteVacio: true,
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

  // ── Caja y POS (Fase 10, lib/pos-config.ts) ────────────────────────────────────────────────
  // Las 3 listas van como TEXTO con un formato simple (no existe un tipo "lista múltiple" en
  // ConfigTipo hoy): `valor:Etiqueta` separado por comas para métodos de pago y documentos de
  // garantía; JSON para las fechas rápidas (tienen 2 sub-listas con offset numérico). Se parsean
  // defensivamente en lib/pos-config.ts — un valor mal escrito cae al default, nunca tumba la
  // página. Los 3 defaults son los que YA usaba /pedidos y /caja antes de esta fase (extraídos de
  // components/ui/metodo-pago-botones.tsx, app/pedidos/constructor/garantia-panel.tsx y
  // fechas-panel.tsx) — no son valores inventados nuevos, solo se hicieron editables.
  {
    clave: 'pos_metodos_pago',
    seccion: SECCION_POS,
    etiqueta: 'Métodos de pago',
    descripcion:
      'Métodos de pago disponibles en /caja y /pedidos (botones). Formato: "valor:Etiqueta" separado por comas, ej. "efectivo:Efectivo,yape:Yape,transferencia:Transferencia,tarjeta:Tarjeta".',
    tipo: 'texto',
    default: 'efectivo:Efectivo,yape:Yape,transferencia:Transferencia',
  },
  {
    clave: 'pos_doc_garantia',
    seccion: SECCION_POS,
    etiqueta: 'Tipos de documento en garantía',
    descripcion:
      'Tipos de documento que se pueden retener como garantía en el constructor de pedidos. Formato: "valor:Etiqueta" separado por comas, ej. "dni:DNI,carnet:Carnet ext.".',
    tipo: 'texto',
    default: 'dni:DNI,carnet:Carnet ext.,licencia:Licencia,otro:Otro',
  },
  {
    clave: 'pos_fechas_rapidas',
    seccion: SECCION_POS,
    etiqueta: 'Fechas rápidas (entrega / devolución)',
    descripcion:
      'Atajos de fecha del constructor de pedidos, en JSON: {"entrega":[{"dias":N,"label":"..."}],"devolucion":[{"dias":N,"label":"..."}]}. "dias" es el desplazamiento desde hoy. Editar con cuidado: un JSON inválido hace que el sistema use el valor por defecto.',
    tipo: 'texto',
    default: '{"entrega":[{"dias":0,"label":"Hoy"},{"dias":1,"label":"Mañana"},{"dias":3,"label":"+3"},{"dias":7,"label":"+7"}],"devolucion":[{"dias":1,"label":"+1"},{"dias":2,"label":"+2"},{"dias":3,"label":"+3"}]}',
  },
  {
    clave: 'pos_garantia_regla',
    seccion: SECCION_POS,
    etiqueta: 'Regla de garantía sugerida',
    descripcion:
      'Regla de negocio para sugerir/exigir garantía en un pedido con alquiler (ej. monto mínimo, o a partir de qué total del pedido es obligatoria). NO CONFIRMADA por el dueño — hoy no se aplica en ningún cálculo, la garantía la decide el cajero a mano en cada pedido. Ver docs/pendientes-negocio.md.',
    tipo: 'texto',
    default: '',
  },

  // ── Acceso (spec permisos/2026-10-06-login-usuario-contrasena, migración 0123) ─────────────
  // Defaults provisionales, anotados en docs/pendientes-negocio.md. Los rangos son los mismos que
  // aplica leerReglasAcceso() en el core: fuera de rango, el login usa el default.
  {
    clave: 'acceso_contrasena_min',
    seccion: SECCION_ACCESO,
    etiqueta: 'Largo mínimo de contraseña',
    descripcion:
      'Caracteres mínimos de una contraseña nueva (al cambiarla o al dar de alta a alguien). Se aplica a las contraseñas que se creen desde ahora, no a las que ya existen. Entre 6 y 72.',
    tipo: 'numero',
    default: '8',
    min: 6,
    max: 72,
    step: 1,
  },
  {
    clave: 'acceso_intentos_max',
    seccion: SECCION_ACCESO,
    etiqueta: 'Intentos fallidos antes de bloquear',
    descripcion:
      'Contraseñas incorrectas seguidas que bloquean la cuenta por un rato. Al generar una contraseña temporal, la cuenta se desbloquea. Entre 3 y 20.',
    tipo: 'numero',
    default: '5',
    min: 3,
    max: 20,
    step: 1,
  },
  {
    clave: 'acceso_bloqueo_min',
    seccion: SECCION_ACCESO,
    etiqueta: 'Minutos de bloqueo',
    descripcion: 'Cuánto dura el bloqueo después de los intentos fallidos. Entre 1 y 1440 (un día).',
    tipo: 'numero',
    default: '15',
    min: 1,
    max: 1440,
    step: 1,
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

  {
    clave: 'valores_min_evaluaciones',
    seccion: SECCION_VALORES,
    etiqueta: 'Mínimo de evaluaciones para ver el resultado',
    descripcion:
      'Cuántas evaluaciones tiene que haber recibido una persona en el mes antes de que vea su resultado. Con menos, la pantalla no muestra nada (ni cuántas hay), para que nadie pueda deducir quién puntuó qué. Valor provisional de 3, NO confirmado por el dueño — ver docs/pendientes-negocio.md. Un valor vacío o menor que 1 se toma como 3.',
    tipo: 'numero',
    default: '3',
    min: 1,
    max: 100,
    step: 1,
  },

  // ── Sueldos (packages/core/src/sueldos.ts::PARAMETROS_SUELDO_DEFAULT, migración 0068) ───────
  // Son 15 de los 16 parámetros del motor. `metaSemanal` NO está acá a propósito: es
  // `number | null` y el null significa "no hay meta pactada, sugerila", cosa que una fila de
  // texto no puede expresar. Vive en el contrato (sueldo_acuerdos.parametros).
  //
  // Todos se pueden pisar POR CONTRATO desde el mismo jsonb, con la clave en camelCase. Lo de acá
  // es el default de la empresa.
  {
    clave: 'sueldo_tolerancia_minutos',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Tolerancia de ingreso (minutos)',
    descripcion:
      'Minutos de gracia después de la hora contratada antes de que el ingreso cuente como tardanza. Depende del acuerdo de cada persona: se puede cambiar por contrato.',
    tipo: 'numero',
    default: '10',
    min: 0,
    step: 1,
  },
  {
    clave: 'sueldo_tardanzas_libres',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Tardanzas libres por periodo',
    descripcion:
      'Cuántas tardanzas del periodo no se descuentan nunca. Es un periodo de gracia; las que pasan de esta cantidad sí se cobran.',
    tipo: 'numero',
    default: '3',
    min: 0,
    step: 1,
  },
  {
    clave: 'sueldo_penalidad_tardanza',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Descuento por tardanza (S/)',
    descripcion:
      'Soles que se descuentan por cada tardanza injustificada, una vez pasadas las libres. El administrador puede justificar una tardanza y entonces no se cobra.',
    tipo: 'numero',
    default: '5',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'sueldo_valor_almuerzo',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Valor del almuerzo (S/)',
    descripcion:
      'Soles que se pagan por cada almuerzo al que la persona tuvo derecho y NO se le entregó en especie. Los entregados se registran y se restan.',
    tipo: 'numero',
    default: '8',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'sueldo_horas_minimas_almuerzo',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Horas para que un día gane almuerzo',
    descripcion:
      'Horas trabajadas que hacen que un día cuente como tiempo completo y gane almuerzo. Se mira día por día, no el contrato: hay quien tiene días completos y días de medio turno, y sólo los completos ganan. El administrador puede habilitarlo igual desde el contrato.',
    tipo: 'numero',
    default: '12',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'sueldo_valor_capacitacion',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Pago por persona capacitada (S/)',
    descripcion:
      'Soles que se pagan por cada persona nueva que el colaborador capacitó en el periodo. No es un valor fijo: depende de qué tan bien se capacite, y está pendiente de confirmar con el administrador.',
    tipo: 'numero',
    default: '25',
    min: 0,
    step: 1,
  },
  {
    clave: 'sueldo_bono_meta_semanal',
    seccion: SECCION_SUELDOS,
    etiqueta: '2.ª comisión: bono por semana con la meta cumplida (S/)',
    descripcion:
      'Soles que gana la persona por cada semana del periodo en la que llegó a su meta de venta. Es un premio semanal fijo, pero la meta no: una semana más larga pide más, salvo que se encienda «Meta semanal fija».',
    tipo: 'numero',
    default: '30',
    min: 0,
    step: 5,
  },
  {
    clave: 'sueldo_factor_meta',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Factor de la meta sugerida',
    descripcion:
      'Fracción de la meta que hay que superar para ganar el bono. El Excel usaba 0,85 para hacer alcanzable una meta que salía de una fórmula; a una meta pactada y negociada no se le descuenta nada, por eso el default es 1,00. Sólo afecta a la meta SUGERIDA, nunca a la pactada en el contrato.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.05,
  },
  {
    clave: 'sueldo_meta_semanal_fija',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Meta semanal fija',
    descripcion:
      'Apagado (default): la meta sale de las horas contratadas de cada tramo, así que la semana que absorbe los días sobrantes del mes SÍ sube su meta. Ojo: la meta del mes es la suma de las semanales, así que eso sube también el umbral de la comisión. Encendido: la meta es la misma todas las semanas y sale de la plantilla semanal completa, así una persona no paga que su mes tenga 31 días. Sólo afecta a la meta sugerida: sobre una meta pactada en el contrato no hace nada.',
    tipo: 'booleano',
    default: 'false',
  },
  {
    clave: 'sueldo_pct_comision',
    seccion: SECCION_SUELDOS,
    etiqueta: '1.ª comisión: porcentaje sobre ventas (%)',
    descripcion:
      'Porcentaje de la base de comisión que se paga: 2 = 2 %. La comisión se desbloquea sólo cuando la persona cumple la meta de venta del mes.',
    tipo: 'numero',
    // Se guarda como fracción (0.02 = 2 %), que es lo que multiplica el motor (RN-13); la pantalla
    // la muestra en porcentaje. min/max son de la fracción: 0 % a 100 %.
    default: '0.02',
    min: 0,
    max: 1,
    unidad: 'porcentaje',
  },
  {
    clave: 'sueldo_monto_minimo_comision',
    seccion: SECCION_SUELDOS,
    etiqueta: '1.ª comisión: monto mínimo de boleta (S/)',
    descripcion:
      'Sólo las boletas por encima de este monto entran a la base de comisión. Se mira el total de la boleta, no cada producto.',
    tipo: 'numero',
    default: '120',
    min: 0,
    step: 10,
  },
  {
    clave: 'sueldo_dias_descuento_por_falta',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Días de sueldo que cuesta una falta',
    descripcion:
      'Días EN TOTAL que pierde quien falta sin justificar, contando el día que no vino. Con 2, pierde ese día más uno de castigo. Una falta justificada pierde sólo el día que no vino, sin castigo.',
    tipo: 'numero',
    default: '2',
    min: 1,
    step: 1,
  },
  {
    clave: 'sueldo_meta_por_hora',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Venta esperada por hora contratada (S/)',
    descripcion:
      'Sólo se usa para SUGERIR una meta cuando el contrato no tiene una pactada: meta = horas de la semana × este valor. No es un valor fijo, es un indicativo. Ojo: guardarlo redondeado a 45,4545 deja la meta del periodo en 7.499,99 en vez de 7.500 y el bono no se paga — el default trae todos los decimales de 1500 ÷ 33.',
    tipo: 'numero',
    default: '45.45454545454545',
    min: 0,
  },
  {
    // RN-17 ampliada (SPEC-cambios-reglas-2026-08-17 C-03). Default 1: con el default ninguna
    // liquidación existente cambia de monto. Es factor y no monto porque un monto quedaría viejo
    // cada vez que cambie el sueldo pactado.
    clave: 'sueldo_factor_hora_fuera_contrato',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Factor de la hora fuera de contrato',
    descripcion:
      'Multiplica el valor de la hora SÓLO en el bloque de horas fuera de contrato: trabajo puntual en un día que la persona no tenía contratado. Con 1 se paga igual que cualquier otra hora, que es lo habitual; con 1,5 se paga un 50% más. No toca la diferencia de horas de un día normal. Se puede pactar distinto por contrato.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.1,
  },
  {
    // RN-05 con tramos (SPEC-cambios-reglas-2026-08-17 C-01). Sin umbral, dos marcas del mismo
    // momento parten el día en dos tramos y le descuentan minutos a alguien todos los días.
    clave: 'sueldo_pausa_minima_minutos',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Minutos para que un hueco cuente como pausa',
    descripcion:
      'Si alguien sale y vuelve, ese hueco no se paga. Este es el mínimo para considerarlo una pausa de verdad: por debajo se entiende que son dos marcas del mismo momento —el clásico «no sonó, marco de nuevo»— y no se descuenta nada. Con 0 se descuenta cualquier hueco, por chico que sea.',
    tipo: 'numero',
    default: '15',
    min: 0,
    step: 5,
  },
  {
    // Regla A del marcaje astuto (SPEC-cambios-reglas-2026-08-17 C-05). Es una señal de gestión,
    // no un descuento: marca el día para que una persona lo mire. Va acá y no quemado en la
    // pantalla porque el umbral depende de cómo trabaja cada equipo — Alexander avisó que quedarse
    // dos horas terminando pendientes es normal, y con 60 minutos la señal sería puro ruido.
    clave: 'sueldo_margen_horas_dia_minutos',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Margen antes de marcar un día para revisión (minutos)',
    descripcion:
      'Si un día declara más horas que las contratadas por encima de este margen, la pantalla de asistencia lo marca para revisión. No descuenta ni acusa: sólo avisa. Con 0 se marca cualquier exceso; subilo si quedarse un rato de más es lo normal en tu equipo.',
    tipo: 'numero',
    default: '120',
    min: 0,
    step: 15,
  },
  // Pagos de liquidación (migración 0080, spec §2.6). Mismo formato simple que pos_metodos_pago
  // arriba: texto libre separado por comas, sin el prefijo "valor:Etiqueta" de aquél porque acá
  // el método se guarda tal cual lo escribe el administrador (texto libre, RN de la 0080) — no
  // hay un valor interno distinto de la etiqueta que mostrar. Sin este item el catálogo no
  // conocía la clave y /configuracion la mostraba como "Personalizada" con una etiqueta adivinada
  // de la clave y sin ninguna descripción.
  {
    clave: 'sueldo_metodos_pago',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Métodos de pago de liquidaciones',
    descripcion:
      'Métodos disponibles al registrar un abono contra una liquidación cerrada (pestaña Liquidación y pago). Separados por comas, ej. "Efectivo,Yape,Plin,Transferencia,Otro". Default inventado el 23-ago-2026, no confirmado por el dueño — editable acá.',
    tipo: 'texto',
    default: 'Efectivo,Yape,Plin,Transferencia,Otro',
  },

  // ── Huellero (migración 0075) ─────────────────────────────────────────────────────────────
  // Van tipados a propósito. Sin catálogo aparecen como "Personalizados" con input de texto
  // libre, y la derivación los castea a numeric: un "12,5" escrito con coma hacía fallar cada
  // ciclo del colector, sin que entrara ninguna marca y con la pantalla culpando al equipo.
  {
    clave: 'huellero_jornada_max_horas',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Jornada máxima creíble (horas)',
    descripcion:
      'Una jornada derivada del huellero que dure más que esto NO se da por trabajada: se guardan las horas reales y el día queda para que lo revise una persona. No recorta nada. Existe porque quien entra y sale muchas veces al día deja una primera y una última marca que no son su jornada — hay días reales de 22 horas.',
    tipo: 'numero',
    default: '14',
    min: 1,
    step: 1,
  },
  {
    clave: 'huellero_jornada_min_horas',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Jornada mínima creíble (horas)',
    descripcion:
      'Lo mismo por abajo. Dos marcas en el mismo minuto dan una jornada de cero horas, y declararla trabajada impide cerrar la liquidación de esa persona en todo el mes. Confirmar el valor si hay gente que trabaja por horas sueltas.',
    tipo: 'numero',
    default: '0.5',
    min: 0,
  },
  // Migración 0096 (spec asistencias/2026-08-25-huellero-decide-por-horario-design.md §3, C-2).
  // Default elegido por el implementador, no confirmado: es el umbral más chico que resuelve el
  // caso que nombró el administrador ("8:00 y 8:01, se queda el más temprano") sin comerse la
  // pausa real de arriba. Anotado en docs/pendientes-negocio.md.
  {
    clave: 'huellero_doble_marca_minutos',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Minutos para considerar dos marcas como un solo toque',
    descripcion:
      'Dos marcas del huellero separadas por menos de esto son la MISMA persona apoyando el dedo dos veces (el primer toque no sonó): se guarda la más temprana y se descarta la otra, tanto al llegar como al irse. Tiene que ser menor que "Minutos para que un hueco cuente como pausa" — si son dos marcas de verdad distintas (salió y volvió), esa otra regla sigue decidiendo.',
    tipo: 'numero',
    default: '2',
    min: 0,
    step: 1,
  },
  // Migración 0097 (spec asistencias/2026-08-25-huellero-decide-por-horario-design.md §3, C-4).
  // Default elegido por el implementador, no confirmado: las faltas reales son individuales, las
  // caídas del equipo son colectivas — dos personas faltando el mismo día es normal, once no lo
  // es nunca. Anotado en docs/pendientes-negocio.md.
  {
    clave: 'huellero_falta_auto_max_personas',
    seccion: SECCION_SUELDOS,
    etiqueta: 'Freno de la falta automática (máximo de personas)',
    descripcion:
      'Si en un mismo día hay MÁS personas que esto con turno contratado y cero marcas del huellero, el sistema NO declara falta a ninguna: asume que el equipo falló, deja esos días en "sin declarar" con el motivo escrito, y el administrador los revisa a mano. Con esta cantidad o menos, sí se declara falta automáticamente (marcada como puesta por el sistema, sin justificar).',
    tipo: 'numero',
    default: '2',
    min: 0,
    step: 1,
  },
  // Migración 0112 (spec pipeline/2026-10-04-codigo-personal-design.md §4). Los tres defaults los
  // eligió el implementador y NO están confirmados por el dueño (docs/pendientes-negocio.md).
  // Migración 0131 (spec capacitacion/2026-10-17-...). Default provisional, NO confirmado por el dueño.
  // Migración 0134 (ticket 14). Default del Excel del dueño («Prueba (3 días)»), por confirmar.
  {
    clave: 'personal_prueba_dias',
    seccion: SECCION_INGRESO,
    etiqueta: 'Días de la prueba de ingreso',
    descripcion: 'Cuántos días dura la prueba de un candidato antes de decidir su alta. Cuenta el día de inicio.',
    tipo: 'numero',
    default: '3',
    min: 1,
    step: 1,
  },
  {
    clave: 'capacitacion_nota_aprobatoria',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Nota mínima del examen para aprobar la capacitación',
    descripcion: 'Escala /20. Con una nota menor (o con algún ítem del checklist en «malo»), la capacitación se cierra como «por reforzar».',
    tipo: 'numero',
    default: '14',
    min: 1,
    step: 0.5,
  },
  {
    clave: 'codigo_max_intentos',
    seccion: SECCION_CODIGO,
    etiqueta: 'Intentos fallidos antes de bloquear',
    descripcion:
      'En un equipo compartido, cuántos PIN incorrectos se aceptan dentro de la ventana de abajo, contados por sesión y por persona, antes de bloquear (aunque el siguiente sea el correcto). El administrador recibe un aviso.',
    tipo: 'numero',
    default: '5',
    min: 1,
    step: 1,
  },
  {
    clave: 'codigo_ventana_intentos_min',
    seccion: SECCION_CODIGO,
    etiqueta: 'Minutos que cuenta cada intento fallido',
    descripcion:
      'Ventana en la que se cuentan los intentos fallidos de una sesión. Pasado ese tiempo el fallo deja de contar y el bloqueo se levanta.',
    tipo: 'numero',
    default: '15',
    min: 1,
    step: 1,
  },
  {
    clave: 'codigo_operador_min',
    seccion: SECCION_CODIGO,
    etiqueta: 'Minutos de operador activo sin actividad',
    descripcion:
      'Tras ingresar su código, quien opera el tablero de un equipo compartido sigue activo hasta que pasen estos minutos sin mover ninguna prenda; después tiene que volver a ingresar el código.',
    tipo: 'numero',
    default: '10',
    min: 1,
    step: 1,
  },
  {
    clave: 'codigo_operador_max_h',
    seccion: SECCION_CODIGO,
    etiqueta: 'Horas máximas de un operador (desde que ingresó)',
    descripcion:
      'Tope de vida de un operador de equipo compartido contada desde que tecleó su código, aunque siga moviendo prendas sin parar (un turno). Pasado ese tiempo tiene que volver a ingresar el código.',
    tipo: 'numero',
    default: '8',
    min: 1,
    step: 1,
  },
  {
    clave: 'codigo_pin_min_largo',
    seccion: SECCION_CODIGO,
    etiqueta: 'Dígitos mínimos del PIN personal',
    descripcion:
      'Largo mínimo del PIN que cada persona define en «Mi desempeño» para operar en un equipo compartido. Sólo afecta a los PIN que se definan o cambien después.',
    tipo: 'numero',
    default: '6',
    min: 4,
    step: 1,
  },
  {
    clave: 'pipeline_mov_prefijo',
    seccion: SECCION_CODIGO,
    etiqueta: 'Prefijo del código de movimiento',
    descripcion:
      'Letras con que empieza el código de cada movimiento de una prenda (MOV-AAMMDD-00001). Sólo cambia los códigos que se generen después. Valor provisional: el dueño no definió el formato.',
    tipo: 'texto',
    default: 'MOV',
  },
  {
    clave: 'examen_preguntas_por_intento',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Preguntas por intento de examen',
    descripcion: 'Cuántas preguntas se sortean del banco en cada intento del examen de software o escrito. Valor provisional.',
    tipo: 'numero',
    default: '10',
    min: 1,
    step: 1,
  },
  {
    clave: 'examen_intentos_max',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Intentos máximos por examen',
    descripcion: 'Cuántas veces puede rendir la persona nueva cada examen online durante su capacitación. Cuenta la última nota. Valor provisional.',
    tipo: 'numero',
    default: '3',
    min: 1,
    step: 1,
  },
  {
    clave: 'examen_peso_software',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Peso del examen de software',
    descripcion: 'Cuánto pesa el examen de software en la nota integral (junto a los otros dos). Con los tres iguales es un promedio simple. Valor provisional.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'examen_peso_escrito',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Peso del examen escrito',
    descripcion: 'Cuánto pesa el examen escrito de conocimientos en la nota integral. Valor provisional.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'examen_peso_presencial',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Peso del examen presencial',
    descripcion: 'Cuánto pesa el examen presencial de habilidades en la nota integral. Valor provisional.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.5,
  },
  {
    clave: 'examen_peso_manual',
    seccion: SECCION_CAPACITACION,
    etiqueta: 'Peso del examen cargado a mano',
    descripcion: 'Cuánto pesa el último examen que registra el capacitador a mano en la nota integral, junto a los exámenes online y el presencial. Valor provisional.',
    tipo: 'numero',
    default: '1',
    min: 0,
    step: 0.5,
  },
  // Pago por puntos (migración 0117, spec sueldos/2026-10-05-pago-por-puntos-design.md). SIN default
  // a propósito: la meta la fija el dueño después de un mes de uso, mirando el promedio real. En
  // blanco = desactivado; con cualquiera de las dos en blanco no se paga nada por puntos.
  {
    clave: CLAVE_PUNTOS_META,
    seccion: SECCION_PAGO_PUNTOS,
    etiqueta: 'Meta de puntos del mes',
    descripcion:
      'A partir de cuántos puntos en el mes se empieza a pagar extra. Se paga por los puntos que pasen de esta meta. En un tramo que no es un mes completo (una semana, por ejemplo) la meta se reparte por días.',
    tipo: 'numero',
    default: '',
    min: 0,
    step: 50,
    permiteVacio: true,
  },
  {
    clave: CLAVE_SOLES_POR_PUNTO,
    seccion: SECCION_PAGO_PUNTOS,
    etiqueta: 'Soles por cada punto sobre la meta',
    descripcion: 'Cuánto se le suma a la liquidación por cada punto que supere la meta. Con 0,05, mil puntos sobre la meta son S/50.',
    tipo: 'numero',
    default: '',
    min: 0,
    step: 0.01,
    permiteVacio: true,
  },
  ...escalaItems(),
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
  permiteVacio?: boolean;
  unidad?: 'porcentaje';
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
