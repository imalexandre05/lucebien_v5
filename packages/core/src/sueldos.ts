// sueldos.ts — motor de liquidación de sueldos.
// Implementa docs/superpowers/specs/sueldos/SPEC-sistema-sueldos.md §3 (modelo) y §4 (reglas).
// Reemplaza el archivo `13.-NOMBRE_2026_MES_VERSIÓN 20.0.xlsx`, donde el dato, el cálculo y la
// presentación viven en la misma celda. Acá están separados: esto sólo calcula.
//
// ZONA CRÍTICA (CLAUDE.md no-negociable 1): esto le paga a una persona real. Nada se toca sin
// spec y sin test.
//
// PRINCIPIO DE ENTRADA: este motor prefiere fallar ruidosamente a liquidar con datos incompletos.
// Un dato faltante y un dato en cero NO son lo mismo — confundirlos le descuenta días de sueldo a
// alguien en silencio. Por eso una falta se DECLARA (registro con `horaIngreso: null`) y nunca se
// infiere de que falte la fila. Los caminos que no se pueden distinguir cortan con error; los
// dudosos salen por `advertencias`.
//
// El core NO llama `new Date()` (no-negociable 4): todas las fechas entran como 'YYYY-MM-DD',
// se validan con RE_FECHA en TODA entrada, y la aritmética usa Date.UTC igual que
// evaluaciones.ts, para que el resultado nunca dependa de la zona horaria del proceso.
//
// Redondeo (spec §9.3): cada línea del desglose se redondea a 2 decimales y los totales se arman
// sumando líneas ya redondeadas, para que lo que ve el colaborador sume exactamente el total.
// `valorPorHora` es la única cifra que NO se redondea — redondearla a 3.64 movería el total del
// caso de prueba unos S/0.06.

// ── Parámetros configurables (spec §3.3) ────────────────────────────────────────────────────
// Ninguno va quemado en el código: son los defaults, editables desde /configuracion.
export interface ParametrosSueldo {
  /** Minutos de gracia antes de que un ingreso cuente como tardanza (RN-08). */
  toleranciaMinutos: number;
  /** Tardanzas del periodo que no se descuentan nunca (RN-08). */
  tardanzasLibres: number;
  /** Soles por tardanza injustificada (RN-08). */
  penalidadTardanza: number;
  /** Soles por almuerzo no entregado en especie (RN-15). */
  valorAlmuerzo: number;
  /**
   * Horas que hacen que un día cuente como **tiempo completo** y gane el almuerzo (RN-15).
   * Default 12 (tiempo completo ≈ 12 h, medio tiempo ≈ 6 h). Se mira día por día, no el contrato
   * de la persona: hay colaboradores con días completos y días de medio turno, y sólo los
   * completos ganan el almuerzo. El administrador puede saltearse el umbral con
   * `almuerzoHabilitadoPorAdmin`.
   */
  horasMinimasAlmuerzo: number;
  /** Soles por persona nueva capacitada (RN-16). */
  valorCapacitacion: number;
  /** Soles por semana con la meta cumplida (RN-12). */
  bonoMetaSemanal: number;
  /**
   * Meta de venta de la semana, **pactada en el contrato** (RN-10). Varía por tienda, temporada,
   * experiencia y turno: habitualmente S/3.000 a tiempo completo y S/1.500 a medio tiempo.
   * `null` = no hay meta pactada y el sistema **sugiere** una con la fórmula del Excel
   * (`horas de la semana × metaPorHora`), igual que sugiere un sueldo por escala en RN-14.
   */
  metaSemanal: number | null;
  /**
   * Fracción de la meta que hay que superar (RN-12). Default 1.00: el 0.85 del Excel descontaba
   * una meta *derivada* de una fórmula para hacerla alcanzable; a una meta pactada y negociada no
   * se le descuenta nada. Editable por si lo quieren de vuelta.
   */
  factorMeta: number;
  /**
   * `true` (default): la meta semanal es la misma todas las semanas y sale de la plantilla
   * semanal completa. Una semana que absorbe los días sobrantes del mes NO sube su meta — el
   * bono es un premio semanal fijo y el colaborador no elige que su mes tenga 31 días
   * (decisión de Alexander, 13-ago-2026, spec §9.2).
   * `false`: la meta sale de las horas contratadas de cada tramo, que era la RN-12 original.
   *
   * Sólo afecta a la meta **sugerida**: una meta pactada ya es la misma todas las semanas por
   * definición, así que con `metaSemanal` cargada este parámetro no hace nada.
   */
  metaSemanalFija: boolean;
  /** Porcentaje de comisión sobre la base (RN-13). */
  pctComision: number;
  /** Sólo las boletas por encima de este monto entran a la base de comisión (RN-13). */
  montoMinimoComision: number;
  /**
   * Días de sueldo que una falta injustificada cuesta **EN TOTAL** (RN-09), no los días de
   * castigo encima. Se descuenta `(dias − 1)` porque el día que no trabajó ya salió por RN-06:
   * como el sueldo se paga por horas, no presentarse ya vale un día sin necesidad de castigo.
   * Default 2 → pierde el día que no vino más uno de castigo. La falta justificada pierde sólo
   * el día que no vino.
   */
  diasDescuentoPorFalta: number;
  /**
   * Soles de venta esperados por hora contratada (RN-10). Default = 1500 / 33 exacto:
   * S/1.500 de meta semanal ÷ 33 horas del turno mañana. La spec lo muestra como 45,4545, que
   * es ese mismo número redondeado — usarlo redondeado dejaría la meta del periodo en 7.499,99
   * en vez de 7.500,00.
   */
  metaPorHora: number;
}

export const PARAMETROS_SUELDO_DEFAULT: ParametrosSueldo = {
  toleranciaMinutos: 10,
  tardanzasLibres: 3,
  penalidadTardanza: 5,
  valorAlmuerzo: 8,
  horasMinimasAlmuerzo: 12,
  valorCapacitacion: 25,
  bonoMetaSemanal: 30,
  metaSemanal: null,
  factorMeta: 1,
  metaSemanalFija: true,
  pctComision: 0.02,
  montoMinimoComision: 120,
  diasDescuentoPorFalta: 2,
  metaPorHora: 1500 / 33,
};

/**
 * Mezcla los overrides sobre los defaults y valida el resultado.
 *
 * Una clave con `undefined` o `null` NO pisa el default: así una fila de `config` que todavía no
 * existe, o una columna nula, deja el valor por defecto en vez de convertir el total en `NaN`
 * (que serializa a `null` en JSON, es decir: un pago vacío guardado sin que nadie se entere).
 */
export function resolverParametros(overrides?: Partial<ParametrosSueldo>): ParametrosSueldo {
  const p: ParametrosSueldo = { ...PARAMETROS_SUELDO_DEFAULT };
  for (const [clave, valor] of Object.entries(overrides ?? {})) {
    if (!(clave in PARAMETROS_SUELDO_DEFAULT)) {
      throw new Error(`Parámetro de sueldo desconocido: "${clave}".`);
    }
    // `metaSemanal` es el único que acepta null: significa "no hay meta pactada, sugerila".
    if (valor === undefined || (valor === null && clave !== 'metaSemanal')) continue;
    // Doble aserción: `ParametrosSueldo` no tiene índice de string, así que TypeScript rechaza
    // el cast directo. La clave ya se validó contra el objeto de defaults en la línea 119, que es
    // la comprobación que de verdad importa acá.
    (p as unknown as Record<string, unknown>)[clave] = valor;
  }
  for (const [clave, valor] of Object.entries(p)) {
    if (clave === 'metaSemanalFija') {
      if (typeof valor !== 'boolean') {
        throw new Error(`El parámetro "metaSemanalFija" tiene que ser true o false, llegó: ${String(valor)}.`);
      }
      continue;
    }
    if (clave === 'metaSemanal' && valor === null) continue;
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new Error(`El parámetro "${clave}" tiene que ser un número, llegó: ${String(valor)}.`);
    }
    if (valor < 0) {
      throw new Error(`El parámetro "${clave}" no puede ser negativo, llegó: ${valor}.`);
    }
  }
  return p;
}

// ── Modelo de datos (spec §3) ───────────────────────────────────────────────────────────────

export type ModalidadPago = 'mensual' | 'semanal';

/** Un turno de la plantilla semanal. `diaSemana`: 1 = lunes … 7 = domingo (spec §3.2). */
export interface TurnoContratado {
  diaSemana: number;
  turno?: number;
  horaInicio: string;
  horaFin: string;
}

/**
 * Un día del periodo (spec §3.4). **Todo día contratado tiene que tener el suyo**, trabajado o
 * no: una falta se declara con `horaIngreso: null`, no se deduce de que falte la fila.
 */
export interface RegistroAsistencia {
  fecha: string;
  horaIngreso?: string | null;
  horaSalida?: string | null;
  /** Marca del administrador: esta tardanza no se descuenta (PEND-06 pide además el motivo). */
  tardanzaJustificada?: boolean;
  faltaJustificada?: boolean;
  motivoJustificacion?: string;
  observacion?: string;
}

/** Una sola tabla de ventas; los totales por semana y la base de comisión se derivan (spec §3.5). */
export interface RegistroVenta {
  fecha: string;
  monto: number;
  tiendaId?: number | string;
  tipo?: 'venta' | 'alquiler';
}

/** Adelanto, reporte con descuento o bono extra (spec §3.6). El motivo es obligatorio. */
export interface MovimientoAdmin {
  fecha: string;
  motivo: string;
  monto: number;
}

export interface EntradaLiquidacion {
  fechaInicio: string;
  fechaFin: string;
  /** Input manual del administrador. No se calcula (spec §3.3). */
  sueldoPactado: number;
  horario: TurnoContratado[];
  asistencia: RegistroAsistencia[];
  /** Trabajo puntual fuera del horario pactado (RN-17). */
  horasFueraDeContrato?: RegistroAsistencia[];
  ventas?: RegistroVenta[];
  adelantos?: MovimientoAdmin[];
  reportes?: MovimientoAdmin[];
  bonosExtras?: MovimientoAdmin[];
  almuerzosEntregados?: number;
  /**
   * El administrador le habilitó los almuerzos sin importar las horas del día (RN-15). Con esto
   * en `true`, cualquier día trabajado gana almuerzo aunque no llegue a `horasMinimasAlmuerzo`.
   */
  almuerzoHabilitadoPorAdmin?: boolean;
  personasCapacitadas?: number;
  parametros?: Partial<ParametrosSueldo>;
}

// ── Salida ──────────────────────────────────────────────────────────────────────────────────

export type GrupoLinea = 'ingreso' | 'descuento' | 'ajuste' | 'final';

/** Una línea del desglose. RN-20: toda línea se rastrea hasta los registros que la originaron. */
export interface LineaLiquidacion {
  grupo: GrupoLinea;
  concepto: string;
  /** Lo que hay que enseñarle al colaborador para explicarle de dónde sale el monto. */
  detalle: string;
  monto: number;
  regla: string;
}

export interface SemanaLiquidacion {
  numero: number;
  desde: string;
  hasta: string;
  dias: number;
  diasContratados: number;
  horasContratadas: number;
  meta: number;
  ventas: number;
  cumplida: boolean;
}

export interface Liquidacion {
  periodo: { desde: string; hasta: string; dias: number };
  base: {
    horasContratadas: number;
    diasContratados: number;
    /** Sin redondear a propósito: es el divisor del que cuelga todo el dinero del periodo. */
    valorPorHora: number;
    /** Sólo informativo (RN-04): ningún descuento cuelga de este promedio. */
    sueldoPorDia: number;
  };
  asistencia: {
    diasTrabajados: number;
    horasTrabajadas: number;
    diferenciaHoras: number;
    tardanzas: number;
    tardanzasJustificadas: number;
    tardanzasInjustificadas: number;
    faltas: number;
    faltasJustificadas: number;
    faltasInjustificadas: number;
    diasConDerechoAlmuerzo: number;
    almuerzosAPagar: number;
    horasFueraDeContrato: number;
  };
  ventas: {
    total: number;
    metaPeriodo: number;
    metaAlcanzada: boolean;
    baseComision: number;
    semanas: SemanaLiquidacion[];
    semanasCumplidas: number;
  };
  lineas: LineaLiquidacion[];
  ingresos: number;
  descuentos: number;
  ajustes: number;
  subtotal: number;
  total: number;
  /** Cosas que no detienen el cálculo pero el administrador tiene que ver antes de pagar. */
  advertencias: string[];
}

// ── Fechas y horas: aritmética pura, sin zona horaria ───────────────────────────────────────

const MS_DIA = 24 * 60 * 60 * 1000;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Toda fecha que entra al motor pasa por acá. Un `2025-06-17T00:00:00.000Z` (columna
 * `timestamptz` sin convertir) o un `2025-6-17` sin pad no matchean contra el calendario del
 * periodo: el día se descartaría en silencio y se convertiría en falta. Ver no-negociable 4.
 */
function validarFecha(fecha: unknown, donde: string): string {
  if (typeof fecha !== 'string' || !RE_FECHA.test(fecha)) {
    throw new Error(`${donde}: fecha inválida "${String(fecha)}". Se espera exactamente YYYY-MM-DD.`);
  }
  // El formato no alcanza: '2025-06-31' pasa la expresión regular y no existe. Según dónde caiga,
  // esa fecha se descarta en silencio (una jornada perdida) o se paga de más (una venta que suma
  // comisión). msDeFecha lanza si el ida y vuelta por el calendario no coincide.
  msDeFecha(fecha);
  return fecha;
}

function msDeFecha(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // Date.UTC normaliza calendarios imposibles (31 de febrero → 3 de marzo). Si el ida y vuelta
  // no coincide, la fecha no existe.
  if (new Date(ms).toISOString().slice(0, 10) !== fecha) {
    throw new Error(`La fecha ${fecha} no existe en el calendario.`);
  }
  return ms;
}

const fmtFecha = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** 1 = lunes … 7 = domingo. Equivale al `WEEKDAY(fecha, 2)` del Excel. */
export function diaSemanaISO(fecha: string): number {
  const g = new Date(msDeFecha(validarFecha(fecha, 'diaSemanaISO'))).getUTCDay(); // 0 = domingo
  return g === 0 ? 7 : g;
}

/** Todas las fechas del periodo, inclusive en ambos extremos. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const ini = msDeFecha(validarFecha(desde, 'Inicio del periodo'));
  const fin = msDeFecha(validarFecha(hasta, 'Fin del periodo'));
  if (fin < ini) throw new Error(`Periodo inválido: ${desde} termina después de ${hasta}.`);
  const dias: string[] = [];
  for (let t = ini; t <= fin; t += MS_DIA) dias.push(fmtFecha(t));
  return dias;
}

function minutosDeHora(hora: unknown, donde: string): number {
  if (typeof hora !== 'string') throw new Error(`${donde}: hora inválida "${String(hora)}".`);
  const m = RE_HORA.exec(hora.trim());
  if (!m) throw new Error(`${donde}: hora inválida "${hora}". Se espera HH:MM.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  const seg = m[3] ? Number(m[3]) : 0;
  // Sin este chequeo, un "19:99" tipeado por "19:59" regala 0,65 h pagadas.
  if (h > 23 || min > 59 || seg > 59) {
    throw new Error(`${donde}: hora fuera de rango "${hora}". Las horas van de 00:00 a 23:59.`);
  }
  return h * 60 + min + seg / 60;
}

// Normaliza el cero negativo: `-0` es distinto de `0` para Object.is, y un desglose que
// muestra "-S/0.00" en una línea vacía confunde a quien lo lee.
const r2 = (n: number): number => {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v === 0 ? 0 : v;
};

/** Recorta una lista larga para que un mensaje de error siga siendo legible. */
const primeros = (xs: string[], n = 5): string =>
  xs.length <= n ? xs.join(', ') : `${xs.slice(0, n).join(', ')} … (+${xs.length - n} más)`;

// ── Horario contratado (RN-01, RN-03) ───────────────────────────────────────────────────────

interface DiaContratado {
  horas: number;
  /** Hora de entrada del primer turno, en minutos desde medianoche. Base de la tardanza. */
  inicioMin: number;
}

export function resumirHorario(horario: TurnoContratado[]): Map<number, DiaContratado> {
  const intervalos = new Map<number, { ini: number; fin: number }[]>();
  for (const t of horario) {
    if (!Number.isInteger(t.diaSemana) || t.diaSemana < 1 || t.diaSemana > 7) {
      throw new Error(`diaSemana fuera de rango: ${t.diaSemana}. Se espera 1 (lunes) a 7 (domingo).`);
    }
    const ini = minutosDeHora(t.horaInicio, `Turno del día ${t.diaSemana}`);
    const fin = minutosDeHora(t.horaFin, `Turno del día ${t.diaSemana}`);
    if (fin <= ini) {
      throw new Error(`Turno inválido el día ${t.diaSemana}: ${t.horaInicio}–${t.horaFin}.`);
    }
    const lista = intervalos.get(t.diaSemana) ?? [];
    lista.push({ ini, fin });
    intervalos.set(t.diaSemana, lista);
  }

  const porDia = new Map<number, DiaContratado>();
  for (const [dia, lista] of intervalos) {
    lista.sort((a, b) => a.ini - b.ini);
    // Dos turnos que se pisan inflan las horas contratadas, y como valorPorHora = sueldo /
    // horasContratadas, hunden el valor de la hora de TODO el periodo. Con el horario real de
    // LuceBien (09:00-13:00 + 13:00-20:00) basta tipear el primer turno como 09:00-20:00 para
    // que el total del mes caiga a menos de la mitad.
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].ini < lista[i - 1].fin) {
        throw new Error(
          `Los turnos del día ${dia} se solapan: uno termina después de que empieza el siguiente. Revisá el horario.`,
        );
      }
    }
    porDia.set(dia, {
      horas: lista.reduce((s, x) => s + (x.fin - x.ini) / 60, 0),
      inicioMin: lista[0].ini,
    });
  }
  return porDia;
}

// ── Escala salarial (RN-14) — sugerencia, nunca reemplaza al sueldo pactado ─────────────────

export interface EscalaSueldo {
  escala: number;
  tarifaHora: number;
  antiguedad: string;
}

/**
 * Default editable, no una constante de negocio: cuando suba el sueldo mínimo o el dueño
 * reajuste la escala, se pasa otra tabla en vez de tocar el core. Anotado en
 * docs/pendientes-negocio.md.
 */
export const ESCALAS_SUELDO_DEFAULT: EscalaSueldo[] = [
  { escala: 1, tarifaHora: 2.9, antiguedad: '1er mes' },
  { escala: 2, tarifaHora: 3.2, antiguedad: '1er mes' },
  { escala: 3, tarifaHora: 3.5, antiguedad: '1er a 3er mes' },
  { escala: 4, tarifaHora: 3.8, antiguedad: 'desde el 5to mes' },
  { escala: 5, tarifaHora: 5.0, antiguedad: 'desde el 9no mes' },
];

/** Referencia para negociar, no una obligación. Ver PEND-07: las escalas 1–3 se solapan. */
export function sueldoSugerido(
  escala: number,
  horasContratadas: number,
  escalas: EscalaSueldo[] = ESCALAS_SUELDO_DEFAULT,
): number {
  const e = escalas.find((x) => x.escala === escala);
  if (!e) throw new Error(`Escala inexistente: ${escala}. Válidas: ${escalas.map((x) => x.escala).join(', ')}.`);
  return r2(e.tarifaHora * horasContratadas);
}

// ── Semanas del periodo (RN-12) ─────────────────────────────────────────────────────────────
// Bloques de 7 días desde fechaInicio. La última semana absorbe los días sobrantes: un periodo
// de 31 días son 4 semanas y la cuarta dura 10 días, no 7.

export function tramosSemanales(desde: string, hasta: string): { desde: string; hasta: string }[] {
  const dias = diasDelPeriodo(desde, hasta);
  const n = Math.max(1, Math.floor(dias.length / 7));
  const tramos: { desde: string; hasta: string }[] = [];
  for (let i = 0; i < n; i++) {
    const ini = i * 7;
    const fin = i === n - 1 ? dias.length - 1 : ini + 6;
    tramos.push({ desde: dias[ini], hasta: dias[fin] });
  }
  return tramos;
}

// ── El motor (RN-01 a RN-20) ────────────────────────────────────────────────────────────────

export function liquidarPeriodo(entrada: EntradaLiquidacion): Liquidacion {
  const p = resolverParametros(entrada.parametros);
  const advertencias: string[] = [];

  if (typeof entrada.sueldoPactado !== 'number' || !Number.isFinite(entrada.sueldoPactado)) {
    throw new Error(`El sueldo pactado tiene que ser un número, llegó: ${String(entrada.sueldoPactado)}.`);
  }
  if (entrada.sueldoPactado < 0) {
    throw new Error(`El sueldo pactado no puede ser negativo: ${entrada.sueldoPactado}.`);
  }

  const dias = diasDelPeriodo(entrada.fechaInicio, entrada.fechaFin);
  const enPeriodo = (f: string): boolean => f >= entrada.fechaInicio && f <= entrada.fechaFin;
  const porDia = resumirHorario(entrada.horario);

  // RN-01 / RN-03: qué debía cumplir en el periodo.
  let horasContratadas = 0;
  let diasContratados = 0;
  for (const fecha of dias) {
    const c = porDia.get(diaSemanaISO(fecha));
    if (c && c.horas > 0) {
      horasContratadas += c.horas;
      diasContratados += 1;
    }
  }

  // RN-02: si no hay horas contratadas no hay valor por hora, y sin eso no hay nada que liquidar.
  if (horasContratadas <= 0) {
    throw new Error(
      `El periodo ${entrada.fechaInicio}–${entrada.fechaFin} no tiene horas contratadas: no se puede liquidar.`,
    );
  }
  const valorPorHora = entrada.sueldoPactado / horasContratadas;
  const sueldoPorDia = entrada.sueldoPactado / diasContratados;

  // ── Asistencia (RN-05 a RN-09, RN-15) ─────────────────────────────────────────────────────
  const asistencia = entrada.asistencia ?? [];
  const fueraDeContrato = entrada.horasFueraDeContrato ?? [];

  const porFecha = new Map<string, RegistroAsistencia>();
  const fueraDelPeriodo: string[] = [];
  for (const r of asistencia) {
    const fecha = validarFecha(r.fecha, 'Asistencia');
    if (porFecha.has(fecha)) throw new Error(`Fecha repetida en la asistencia: ${fecha}.`);
    porFecha.set(fecha, r);
    if (!enPeriodo(fecha)) fueraDelPeriodo.push(fecha);
  }
  if (fueraDelPeriodo.length > 0) {
    advertencias.push(
      `${fueraDelPeriodo.length} registro(s) de asistencia quedaron fuera del periodo y no se contaron: ${primeros(fueraDelPeriodo)}.`,
    );
  }

  // Un día contratado sin registro no se puede distinguir de "no cargué la asistencia", y como
  // cada falta cuesta el día de horas MÁS el descuento de RN-09, el silencio sale carísimo.
  // Una falta se declara con horaIngreso: null.
  const sinRegistro = dias.filter((f) => {
    const c = porDia.get(diaSemanaISO(f));
    return c && c.horas > 0 && !porFecha.has(f);
  });
  if (sinRegistro.length > 0) {
    throw new Error(
      `Faltan ${sinRegistro.length} día(s) contratado(s) en la asistencia: ${primeros(sinRegistro)}. ` +
        `Una falta se registra con horaIngreso en null, no omitiendo el día.`,
    );
  }

  const horasDelRegistro = (r: RegistroAsistencia, donde: string): number => {
    const tieneIngreso = r.horaIngreso != null && r.horaIngreso !== '';
    const tieneSalida = r.horaSalida != null && r.horaSalida !== '';
    if (tieneIngreso !== tieneSalida) {
      // El error de marcación más común: marcó la entrada y se fue sin marcar la salida. RN-05
      // dice que eso vale 0 horas, pero pasar por acá sin avisar le come el día y el almuerzo.
      advertencias.push(
        `${donde} ${r.fecha}: tiene ${tieneIngreso ? 'ingreso sin salida' : 'salida sin ingreso'}. Cuenta como 0 horas.`,
      );
      return 0;
    }
    if (!tieneIngreso) return 0; // RN-05
    const ini = minutosDeHora(r.horaIngreso, `${donde} ${r.fecha}`);
    const fin = minutosDeHora(r.horaSalida, `${donde} ${r.fecha}`);
    if (fin <= ini) {
      throw new Error(`${donde} ${r.fecha}: la salida (${r.horaSalida}) no es posterior al ingreso (${r.horaIngreso}).`);
    }
    return (fin - ini) / 60;
  };

  const trabajadas = new Map<string, number>();
  let horasTrabajadas = 0;
  let diferenciaHoras = 0;
  let diasTrabajados = 0;
  let diasConDerechoAlmuerzo = 0;
  let tardanzas = 0;
  let tardanzasJustificadas = 0;
  let faltas = 0;
  let faltasJustificadas = 0;
  let horasFaltadas = 0; // horas contratadas de los días que faltó SIN justificar (RN-09)
  let justificacionesHuerfanas = 0;

  for (const fecha of dias) {
    const contratado = porDia.get(diaSemanaISO(fecha));
    const horasContratadasDelDia = contratado?.horas ?? 0;
    const reg = porFecha.get(fecha);
    const horas = reg ? horasDelRegistro(reg, 'Asistencia') : 0;

    horasTrabajadas += horas;
    trabajadas.set(fecha, horas);
    diferenciaHoras += horas - horasContratadasDelDia; // RN-06

    if (horas > 0) {
      diasTrabajados += 1;
      // RN-15: el almuerzo se gana por DÍA de tiempo completo, no por contrato de la persona.
      if (horas >= p.horasMinimasAlmuerzo || entrada.almuerzoHabilitadoPorAdmin) {
        diasConDerechoAlmuerzo += 1;
      }
    }

    let esTardanza = false;
    let esFalta = false;
    if (horasContratadasDelDia > 0) {
      if (!reg || reg.horaIngreso == null || reg.horaIngreso === '') {
        esFalta = true; // RN-09
      } else {
        // RN-08: el límite se deriva del horario del día + la tolerancia, no es un texto fijo.
        const limite = (contratado as DiaContratado).inicioMin + p.toleranciaMinutos;
        esTardanza = minutosDeHora(reg.horaIngreso, `Asistencia ${fecha}`) > limite;
      }
    }
    // Un día sin horario contratado no genera ni tardanza ni falta (RN-08 / RN-09).

    if (esTardanza) tardanzas += 1;
    if (esFalta) faltas += 1;

    // Las marcas de justificación se cuentan sobre TODOS los días, no sólo sobre los que ya
    // dieron tardanza o falta: si no, una justificación puesta en el día equivocado se descarta
    // sin que nadie se entere y el colaborador paga una tardanza que el admin creyó perdonar.
    if (reg?.tardanzaJustificada) {
      if (esTardanza) tardanzasJustificadas += 1;
      else justificacionesHuerfanas += 1;
    }
    if (reg?.faltaJustificada) {
      if (esFalta) faltasJustificadas += 1;
      else justificacionesHuerfanas += 1;
    }
    // RN-09: el castigo se cobra sobre las horas del día que faltó, no sobre un día promedio.
    if (esFalta && !reg?.faltaJustificada) horasFaltadas += horasContratadasDelDia;
  }

  if (justificacionesHuerfanas > 0) {
    advertencias.push(
      `${justificacionesHuerfanas} justificación(es) cayeron en días que no generaron tardanza ni falta: no descuentan nada. Revisá las fechas.`,
    );
  }
  if (faltas > 0) {
    advertencias.push(`El periodo tiene ${faltas} falta(s) en días con horario contratado.`);
  }

  // RN-17: una fecha no puede cobrarse dos veces, ni arrastrarse de otro periodo.
  let horasFuera = 0;
  const fechasFuera = new Set<string>();
  const fueraDelPeriodoExtra: string[] = [];
  for (const r of fueraDeContrato) {
    const fecha = validarFecha(r.fecha, 'Horas fuera de contrato');
    if (fechasFuera.has(fecha)) {
      throw new Error(`Fecha repetida en horas fuera de contrato: ${fecha}.`);
    }
    fechasFuera.add(fecha);
    if (!enPeriodo(fecha)) {
      fueraDelPeriodoExtra.push(fecha);
      continue; // un registro del mes pasado no se vuelve a cobrar este mes
    }
    const horas = horasDelRegistro(r, 'Horas fuera de contrato');
    if (horas > 0 && (trabajadas.get(fecha) ?? 0) > 0) {
      throw new Error(
        `La fecha ${fecha} está en la asistencia normal y en horas fuera de contrato: se pagaría dos veces.`,
      );
    }
    horasFuera += horas;
  }
  if (fueraDelPeriodoExtra.length > 0) {
    advertencias.push(
      `${fueraDelPeriodoExtra.length} registro(s) de horas fuera de contrato quedaron fuera del periodo y no se pagaron: ${primeros(fueraDelPeriodoExtra)}.`,
    );
  }

  const tardanzasInjustificadas = Math.max(0, tardanzas - p.tardanzasLibres - tardanzasJustificadas);
  const faltasInjustificadas = Math.max(0, faltas - faltasJustificadas);

  // RN-15: nunca negativo.
  const almuerzosEntregados = entrada.almuerzosEntregados ?? 0;
  if (!Number.isFinite(almuerzosEntregados) || almuerzosEntregados < 0) {
    throw new Error(`Almuerzos entregados inválido: ${String(entrada.almuerzosEntregados)}.`);
  }
  if (almuerzosEntregados > diasConDerechoAlmuerzo) {
    advertencias.push(
      `Se entregaron ${almuerzosEntregados} almuerzos pero sólo ${diasConDerechoAlmuerzo} día(s) de tiempo completo dan derecho.`,
    );
  }
  const almuerzosAPagar = Math.max(0, diasConDerechoAlmuerzo - almuerzosEntregados);

  const personasCapacitadas = entrada.personasCapacitadas ?? 0;
  if (!Number.isFinite(personasCapacitadas) || personasCapacitadas < 0) {
    throw new Error(`Personas capacitadas inválido: ${String(entrada.personasCapacitadas)}.`);
  }

  // ── Ventas y metas (RN-10 a RN-13) ────────────────────────────────────────────────────────
  const ventas = entrada.ventas ?? [];
  const ventasValidas: RegistroVenta[] = [];
  let ventasFuera = 0;
  for (const v of ventas) {
    const fecha = validarFecha(v.fecha, 'Venta');
    if (typeof v.monto !== 'number' || !Number.isFinite(v.monto) || v.monto < 0) {
      throw new Error(`Venta del ${fecha} con monto inválido: ${String(v.monto)}.`);
    }
    if (enPeriodo(fecha)) ventasValidas.push(v);
    else ventasFuera += 1;
  }
  if (ventasFuera > 0) {
    advertencias.push(`${ventasFuera} venta(s) quedaron fuera del periodo y no se contaron.`);
  }
  if (ventasValidas.length === 0) {
    // "Sin ventas" y "no cargué las ventas" dan el mismo número y hoy la grilla se llena a mano
    // (PEND-08): sin este aviso se pierden el bono y la comisión en silencio.
    advertencias.push(
      'No hay ninguna venta registrada en el periodo: no se paga comisión ni bono por metas. Verificá si es correcto.',
    );
  }
  const ventasTotal = ventasValidas.reduce((s, v) => s + v.monto, 0);

  // RN-12: la última semana absorbe los días sobrantes para que ninguna venta quede fuera, pero
  // su meta NO sube por eso: es la de una semana tipo (spec §9.2).
  const horasSemanaTipo = [...porDia.values()].reduce((s, d) => s + d.horas, 0);
  let metaPeriodo = 0; // RN-11: la meta del mes es la suma de las semanales, no un cálculo aparte
  const semanas: SemanaLiquidacion[] = tramosSemanales(entrada.fechaInicio, entrada.fechaFin).map((t, i) => {
    const diasSemana = diasDelPeriodo(t.desde, t.hasta);
    let horas = 0;
    let contratadosSemana = 0;
    for (const fecha of diasSemana) {
      const c = porDia.get(diaSemanaISO(fecha));
      if (c && c.horas > 0) {
        horas += c.horas;
        contratadosSemana += 1;
      }
    }
    // RN-10: manda lo pactado en el contrato. Sin meta pactada, se sugiere una por horas.
    // RN-10: `factorMeta` sólo descuenta la meta SUGERIDA. A una meta pactada y negociada con
    // el colaborador no se le descuenta nada (spec §3.3).
    const horasDeLaMeta = p.metaSemanalFija ? horasSemanaTipo : horas;
    const meta = p.metaSemanal ?? horasDeLaMeta * p.metaPorHora * p.factorMeta;
    metaPeriodo += meta;
    const ventasSemana = ventasValidas
      .filter((v) => v.fecha >= t.desde && v.fecha <= t.hasta)
      .reduce((s, v) => s + v.monto, 0);
    return {
      numero: i + 1,
      desde: t.desde,
      hasta: t.hasta,
      dias: diasSemana.length,
      diasContratados: contratadosSemana,
      horasContratadas: r2(horas),
      meta: r2(meta),
      ventas: r2(ventasSemana),
      cumplida: ventasSemana > meta,
    };
  });
  const semanasCumplidas = semanas.filter((s) => s.cumplida).length;

  // RN-13: la comisión se desbloquea sólo al llegar a la meta del mes. Es un premio distinto al
  // bono semanal, no un reemplazo: se pueden cobrar los dos.
  const metaAlcanzada = ventasTotal >= metaPeriodo;
  const baseComision = ventasValidas
    .filter((v) => v.monto > p.montoMinimoComision)
    .reduce((s, v) => s + v.monto, 0);
  const comision = metaAlcanzada ? baseComision * p.pctComision : 0;

  // ── Movimientos administrativos (RN-18 y spec §6: sin motivo no se registra) ───────────────
  const sumarMovimientos = (movs: MovimientoAdmin[] | undefined, etiqueta: string): number => {
    let total = 0;
    for (const m of movs ?? []) {
      const fecha = validarFecha(m.fecha, etiqueta);
      if (!m.motivo || !m.motivo.trim()) {
        throw new Error(`${etiqueta} del ${fecha} por ${m.monto} no tiene motivo.`);
      }
      // Un monto negativo invierte la línea: un adelanto de −100 pasaría de descontar a sumar.
      if (typeof m.monto !== 'number' || !Number.isFinite(m.monto) || m.monto <= 0) {
        throw new Error(`${etiqueta} del ${fecha} con monto inválido: ${String(m.monto)}. Tiene que ser mayor a 0.`);
      }
      if (!enPeriodo(fecha)) {
        advertencias.push(`${etiqueta} del ${fecha} está fuera del periodo, pero se contó igual.`);
      }
      total += m.monto;
    }
    return total;
  };
  const adelantos = sumarMovimientos(entrada.adelantos, 'Adelanto');
  const reportes = sumarMovimientos(entrada.reportes, 'Reporte con descuento');
  const bonosExtras = sumarMovimientos(entrada.bonosExtras, 'Bono extra');

  // ── Liquidación (RN-19) ───────────────────────────────────────────────────────────────────
  const capacitaciones = personasCapacitadas * p.valorCapacitacion; // RN-16
  // RN-09: `diasDescuentoPorFalta` son los días que la falta cuesta EN TOTAL. Se resta 1 porque
  // el día que no trabajó ya salió por RN-06 — el sueldo se paga por horas, así que no
  // presentarse ya vale un día sin necesidad de castigo. La falta justificada pierde sólo ese día.
  //
  // La unidad es EL DÍA QUE FALTÓ, no un día promedio (decisión del dueño, 14-ago-2026, spec
  // §9.6): faltar a un sábado de 1 h cuesta dos sábados y faltar a un lunes de 11 h cuesta dos
  // lunes. Con `sueldoPorDia` el castigo era plano en soles y sólo cuadraba con jornadas
  // uniformes: en un horario de lunes de 11 h y sábados de 1 h, faltar al sábado costaba 10,3
  // sábados de trabajo.
  const diasCastigoPorFalta = Math.max(0, p.diasDescuentoPorFalta - 1);
  const descuentoFaltas = horasFaltadas * valorPorHora * diasCastigoPorFalta;
  const descuentoTardanzas = tardanzasInjustificadas * p.penalidadTardanza; // RN-08

  const lineas: LineaLiquidacion[] = [
    { grupo: 'ingreso', concepto: 'Sueldo', detalle: 'Pactado para el periodo', monto: r2(entrada.sueldoPactado), regla: 'RN-19' },
    {
      grupo: 'ingreso',
      concepto: `Comisión ${r2(p.pctComision * 100)}%`,
      detalle: metaAlcanzada
        ? `${r2(p.pctComision * 100)}% de S/${r2(baseComision)} en boletas mayores a S/${p.montoMinimoComision}`
        : `Sin comisión: ventas S/${r2(ventasTotal)} no alcanzan la meta de S/${r2(metaPeriodo)}`,
      monto: r2(comision),
      regla: 'RN-13',
    },
    {
      grupo: 'ingreso',
      concepto: 'Bono por metas semanales',
      detalle: `${semanasCumplidas} de ${semanas.length} semana(s) × S/${p.bonoMetaSemanal}`,
      monto: r2(semanasCumplidas * p.bonoMetaSemanal),
      regla: 'RN-12',
    },
    {
      grupo: 'ingreso',
      concepto: 'Almuerzos',
      detalle: `${diasConDerechoAlmuerzo} día(s) de tiempo completo − ${almuerzosEntregados} entregado(s) = ${almuerzosAPagar} × S/${p.valorAlmuerzo}`,
      monto: r2(almuerzosAPagar * p.valorAlmuerzo),
      regla: 'RN-15',
    },
    {
      grupo: 'ingreso',
      concepto: 'Horas fuera de contrato',
      detalle: `${r2(horasFuera)} h × S/${valorPorHora.toFixed(4)}`,
      monto: r2(horasFuera * valorPorHora),
      regla: 'RN-17',
    },
    {
      grupo: 'descuento',
      concepto: 'Faltas injustificadas',
      detalle: `${faltasInjustificadas} falta(s) que suman ${r2(horasFaltadas)} h × S/${valorPorHora.toFixed(4)} × ${diasCastigoPorFalta} día(s) de castigo (el día no trabajado ya salió por horas)`,
      monto: r2(-descuentoFaltas),
      regla: 'RN-09',
    },
    {
      grupo: 'descuento',
      concepto: 'Adelantos',
      detalle: `${(entrada.adelantos ?? []).length} adelanto(s) entregado(s) en el periodo`,
      monto: r2(-adelantos),
      regla: 'RN-19',
    },
    {
      grupo: 'ajuste',
      concepto: 'Diferencia de horas',
      detalle: `${r2(horasTrabajadas)} h trabajadas − ${r2(horasContratadas)} h contratadas = ${r2(diferenciaHoras)} h × S/${valorPorHora.toFixed(4)}`,
      monto: r2(diferenciaHoras * valorPorHora),
      regla: 'RN-07',
    },
    {
      grupo: 'ajuste',
      concepto: 'Apoyo en capacitación',
      detalle: `${personasCapacitadas} persona(s) × S/${p.valorCapacitacion}`,
      monto: r2(capacitaciones),
      regla: 'RN-16',
    },
    {
      grupo: 'final',
      concepto: 'Descuento por tardanzas',
      detalle: `${tardanzas} tardanza(s) − ${p.tardanzasLibres} libre(s) − ${tardanzasJustificadas} justificada(s) = ${tardanzasInjustificadas} × S/${p.penalidadTardanza}`,
      monto: r2(-descuentoTardanzas),
      regla: 'RN-08',
    },
    {
      grupo: 'final',
      concepto: 'Reportes con descuento',
      detalle: `${(entrada.reportes ?? []).length} reporte(s) del periodo`,
      monto: r2(-reportes),
      regla: 'RN-19',
    },
    {
      grupo: 'final',
      concepto: 'Bonos extras',
      detalle: `${(entrada.bonosExtras ?? []).length} bono(s) fuera de lo acordado`,
      monto: r2(bonosExtras),
      regla: 'RN-18',
    },
  ];

  const sumar = (grupo: GrupoLinea): number =>
    r2(lineas.filter((l) => l.grupo === grupo).reduce((s, l) => s + l.monto, 0));

  const ingresos = sumar('ingreso');
  const descuentos = sumar('descuento');
  const ajustes = sumar('ajuste');
  const subtotal = r2(ingresos + descuentos + ajustes);
  const total = r2(subtotal + sumar('final'));

  if (total < 0) {
    advertencias.push(`El total del periodo es negativo (S/${total}): el colaborador le debería plata a la empresa. Revisá antes de pagar.`);
  }

  return {
    periodo: { desde: entrada.fechaInicio, hasta: entrada.fechaFin, dias: dias.length },
    base: {
      horasContratadas: r2(horasContratadas),
      diasContratados,
      valorPorHora,
      sueldoPorDia: r2(sueldoPorDia),
    },
    asistencia: {
      diasTrabajados,
      horasTrabajadas: r2(horasTrabajadas),
      diferenciaHoras: r2(diferenciaHoras),
      tardanzas,
      tardanzasJustificadas,
      tardanzasInjustificadas,
      faltas,
      faltasJustificadas,
      faltasInjustificadas,
      diasConDerechoAlmuerzo,
      almuerzosAPagar,
      horasFueraDeContrato: r2(horasFuera),
    },
    ventas: {
      total: r2(ventasTotal),
      metaPeriodo: r2(metaPeriodo),
      metaAlcanzada,
      baseComision: r2(baseComision),
      semanas,
      semanasCumplidas,
    },
    lineas,
    ingresos,
    descuentos,
    ajustes,
    subtotal,
    total,
    advertencias,
  };
}
