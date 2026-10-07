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

/**
 * Qué versión del motor produjo un número. Se guarda en `sueldo_liquidaciones.motor_version`
 * junto al resultado congelado.
 *
 * Vive acá y no en el repo de datos porque identifica a ESTE archivo: si el marcador estuviera
 * del otro lado, cambiar una regla de acá y olvidarse de allá dejaría liquidaciones firmadas con
 * una versión que no las calculó — y el sello serviría para lo contrario de lo que existe.
 *
 * **Se sube la fecha cada vez que cambia una regla de cálculo.** No cuando cambia un comentario
 * ni un tipo: cuando cambia un número que le llega a alguien.
 */
export const MOTOR_VERSION = '2026-10-07';

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
   * `false` (default desde el 17-ago-2026): la meta sale de las horas contratadas de cada tramo,
   * así que una semana que absorbe los días sobrantes del mes **sube su meta**. Es la RN-12
   * original, y es lo que Alexander confirmó el 16-ago-2026: *"exacto, sube"*.
   * `true`: la meta es la misma todas las semanas y sale de la plantilla semanal completa.
   *
   * **El default se invirtió, no se descubrió.** Hasta el 17-ago valía `true`, por la decisión
   * del 13-ago de que el bono es un premio semanal fijo y nadie elige que su mes tenga 31 días
   * (spec §9.2). Ese razonamiento sigue en pie; simplemente no es el que se eligió. Quien quiera
   * la conducta anterior la enciende desde /configuracion, sin tocar código.
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
  /**
   * Multiplica el valor de la hora **sólo** en las horas fuera de contrato (RN-17). Default `1`:
   * esa hora vale lo mismo que cualquier otra, que es como se paga hoy. Con `1.5` se paga un 50%
   * más y con `0.8` menos.
   *
   * Es un factor y no un monto por dos razones: un monto quedaría desactualizado cada vez que
   * cambie el sueldo pactado, y un factor se lee de un vistazo («la hora extra vale una vez y
   * media»). Como los otros trece, se puede pactar por contrato con quien acordó venir un día más.
   *
   * No toca RN-06 ni RN-07: la diferencia de horas de un día **contratado** se sigue pagando a
   * `valorPorHora` pelado. Esto es sólo el bloque de trabajo puntual fuera del horario.
   */
  factorHoraFueraContrato: number;
  /**
   * Minutos entre la salida de un tramo y la entrada del siguiente a partir de los cuales eso
   * cuenta como **pausa de verdad** y no se paga (RN-05, C-01). Por debajo del umbral los dos
   * tramos se fusionan y el hueco se paga.
   *
   * Existe porque sin umbral dos marcas del mismo momento —09:00 y 09:02, el clásico «no sonó,
   * marco de nuevo»— parten el día en dos tramos y le descuentan dos minutos a alguien todos los
   * días. **Default 15: elegido, no confirmado** (ver docs/pendientes-negocio.md).
   *
   * Con `0` cualquier hueco, por chico que sea, se descuenta.
   */
  pausaMinimaMinutos: number;
  /**
   * Puntos del mes a partir de los cuales se paga por puntos (pago por puntos, spec
   * 2026-10-05-pago-por-puntos-design.md). **`null` = desactivado**, y es el default: la meta la
   * fija el dueño después de un mes de uso mirando el promedio real, y hasta entonces no se
   * inventa ninguna. Con cualquiera de las dos claves (esta y `solesPorPunto`) en `null` no se
   * paga nada por puntos y la liquidación no muestra la línea. Un `0` SÍ es un valor.
   */
  puntosMetaMensual: number | null;
  /** Soles por cada punto que supera la meta. `null` = desactivado (ver `puntosMetaMensual`). */
  solesPorPunto: number | null;
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
  metaSemanalFija: false,
  pctComision: 0.02,
  montoMinimoComision: 120,
  diasDescuentoPorFalta: 2,
  metaPorHora: 1500 / 33,
  factorHoraFueraContrato: 1,
  pausaMinimaMinutos: 15,
  puntosMetaMensual: null,
  solesPorPunto: null,
};

/**
 * Mezcla los overrides sobre los defaults y valida el resultado.
 *
 * Una clave con `undefined` o `null` NO pisa el default: así una fila de `config` que todavía no
 * existe, o una columna nula, deja el valor por defecto en vez de convertir el total en `NaN`
 * (que serializa a `null` en JSON, es decir: un pago vacío guardado sin que nadie se entere).
 */
const CLAVES_NULABLES: ReadonlySet<string> = new Set(['metaSemanal', 'puntosMetaMensual', 'solesPorPunto']);

export function resolverParametros(overrides?: Partial<ParametrosSueldo>): ParametrosSueldo {
  const p: ParametrosSueldo = { ...PARAMETROS_SUELDO_DEFAULT };
  for (const [clave, valor] of Object.entries(overrides ?? {})) {
    if (!(clave in PARAMETROS_SUELDO_DEFAULT)) {
      throw new Error(`Parámetro de sueldo desconocido: "${clave}".`);
    }
    // `metaSemanal` y las dos del pago por puntos son las que aceptan null: significa "no hay meta
    // pactada, sugerila" y "pago por puntos desactivado". Con null se queda el default (null).
    if (valor === undefined || (valor === null && !CLAVES_NULABLES.has(clave))) continue;
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
    if (CLAVES_NULABLES.has(clave) && valor === null) continue;
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

/**
 * Cómo se corta el contrato en pagos (spec frecuencia-pago-flexible §3.1). `'dias'` es «cada N
 * días» y necesita `cadaDias`.
 */
export type ModalidadPago = 'mensual' | 'quincenal' | 'semanal' | 'dias';

export interface FrecuenciaPago {
  modalidad: ModalidadPago;
  /** Obligatorio (entero, 1 a 62) sólo cuando `modalidad = 'dias'`. */
  cadaDias?: number | null;
}

/** Un turno de la plantilla semanal. `diaSemana`: 1 = lunes … 7 = domingo (spec §3.2). */
export interface TurnoContratado {
  diaSemana: number;
  turno?: number;
  horaInicio: string;
  horaFin: string;
}

/**
 * Un pedazo continuo del día: entró, trabajó, salió (RN-05, C-01). Un día sin pausas tiene uno
 * solo; uno con pausa tiene tantos como veces volvió.
 */
export interface TramoTrabajado {
  ingreso?: string | null;
  salida?: string | null;
}

/**
 * Un día del periodo (spec §3.4). **Todo día contratado tiene que tener el suyo**, trabajado o
 * no: una falta se declara con `horaIngreso: null`, no se deduce de que falte la fila.
 */
export interface RegistroAsistencia {
  fecha: string;
  horaIngreso?: string | null;
  horaSalida?: string | null;
  /**
   * Los tramos continuos del día (RN-05, C-01). Cuando viene, **manda sobre el par
   * `horaIngreso`/`horaSalida`** y las pausas entre tramos no se pagan. Cuando no viene, el par
   * de arriba se trata como un único tramo y el día se comporta exactamente como siempre.
   *
   * `horaIngreso` sigue siendo el ingreso del **primer** tramo y es el que mide la tardanza: una
   * pausa no hace que alguien llegue tarde dos veces.
   */
  tramos?: TramoTrabajado[];
  /** Marca del administrador: esta tardanza no se descuenta (PEND-06 pide además el motivo). */
  tardanzaJustificada?: boolean;
  faltaJustificada?: boolean;
  motivoJustificacion?: string;
  observacion?: string;
  /**
   * true cuando esa hora la propuso el sistema a partir del horario contratado, porque no hubo
   * marca real del huellero (migración 0098, que expone lo que 0096/0097 ya escriben en
   * `asistencias.entrada_estimada`/`salida_estimada`; spec asistencias/2026-08-25-huellero-
   * decide-por-horario-design.md §3 C-3). Opcionales para no romper ningún snapshot congelado
   * anterior a esta migración, que nunca tuvo estas claves.
   *
   * No cambian NINGÚN cálculo: la hora estimada ya viaja en `horaIngreso`/`horaSalida` (o en
   * `tramos`) como cualquier otra y se paga igual. Sólo alimentan la advertencia de
   * `liquidarPeriodo()` que le avisa a quien firma el pago — mismo motivo que existe la 0085: un
   * dato que nadie declaró no se paga en silencio.
   */
  entradaEstimada?: boolean;
  salidaEstimada?: boolean;
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
  /**
   * Obsoleto: lo mandaba la 0117 y ya no se usa (spec de pago por puntos §8.2). Lo reemplaza
   * `puntosMeses`. Se deja en el tipo sólo para leer entradas guardadas antes de la 0126.
   */
  puntosPeriodo?: number | null;
  /**
   * Meses del contrato cuyo ÚLTIMO día efectivo cae en este tramo, con sus puntos (spec de pago por
   * puntos §8.2). `puntos` es el `puntosTotal` de la evaluación del mes (pipeline + extras +
   * actividades + ventas − incidencias, neto y posiblemente negativo). Cada elemento:
   * `desde` = inicio del mes del contrato; `hasta` = último día efectivo = min(fin del mes, fin del
   * contrato); `hastaMes` = fin del mes completo. `[]` = ningún mes cierra en este tramo.
   * Ausente (`undefined`/`null`) con el pago por puntos activo = la entrada está incompleta.
   * La RPC `sueldo_entrada` lo manda desde la 0126.
   */
  puntosMeses?: Array<{ desde: string; hasta: string; hastaMes: string; puntos: number }> | null;
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

// El día 0 del mes siguiente a (y, m0) es el último día real de (y, m0). Misma fórmula que ya usa
// evaluaciones.ts, duplicada a propósito: este archivo no importa de otras capas del core por una
// sola función de fecha — mismo criterio que ya usa diaSiguiente() en liquidaciones/cliente.tsx
// para no cruzar capas que no corresponden. `m0` es 0-indexado (0 = enero); Date.UTC normaliza
// solo el desborde de mes/año, así que no hace falta ninguna rama especial para diciembre.
function ultimoDiaDelMes(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * El último día de UN PERÍODO que arranca en `desde`, según `modalidad`, recortado a `limite` si
 * el período se pasaría de ahí (spec liquidación-por-tramos, addendum F-1/F-1b).
 *
 * - `'semanal'`: 7 días inclusive (`desde` .. `desde` + 6), mismo criterio que `tramosSemanales()`.
 * - `'quincenal'` y `'dias'`: ver finDeQuincena() y validarCadaDias() más abajo (spec frecuencia-pago-flexible).
 * - `'mensual'`: "un mes menos un día", con el MISMO recorte de mes corto que ya usa
 *   `calcularCiclo()` de `evaluaciones.ts` (`min(díaDeseado − 1, últimoDíaDelMes)`) — pero ANCLADO
 *   en `desde`, nunca en "hoy". `calcularCiclo` contesta "¿qué ciclo contiene HOY?", una pregunta
 *   distinta, siempre anclada en la fecha de hoy: por eso NO sirve para sugerir un período que
 *   arranca en una fecha cualquiera. Verificado corriendo la función real contra un acuerdo vencido:
 *   `calcularCiclo` sugería un "hasta" en el mes de HOY, lejísimos del contrato (ver addendum).
 */
export function finDePeriodo(
  desde: string,
  frecuencia: ModalidadPago | FrecuenciaPago,
  limite?: string,
  ancla?: string,
): string {
  const desdeMs = msDeFecha(validarFecha(desde, 'finDePeriodo: desde'));
  const { modalidad, cadaDias } =
    typeof frecuencia === 'string' ? { modalidad: frecuencia, cadaDias: undefined } : frecuencia;
  let hasta: string;

  if (modalidad === 'semanal') {
    hasta = fmtFecha(desdeMs + 6 * MS_DIA);
  } else if (modalidad === 'dias') {
    const n = validarCadaDias(cadaDias);
    hasta = fmtFecha(desdeMs + (n - 1) * MS_DIA);
  } else if (modalidad === 'mensual') {
    const [y, m, d] = desde.split('-').map(Number);
    const m0 = m - 1; // 0-indexado: el mes en el que arranca `desde`, igual que evaluaciones.ts
    const diaHasta = Math.min(d - 1, ultimoDiaDelMes(y, m0 + 1));
    hasta = fmtFecha(Date.UTC(y, m0 + 1, diaHasta));
  } else if (modalidad === 'quincenal') {
    hasta = finDeQuincena(desde, ancla ?? desde);
  } else {
    throw new Error(
      `finDePeriodo: modalidad desconocida "${String(modalidad)}". Se espera "mensual", "quincenal", "semanal" o "dias".`,
    );
  }

  if (limite !== undefined) {
    const limiteValido = validarFecha(limite, 'finDePeriodo: limite');
    if (hasta > limiteValido) hasta = limiteValido;
  }

  return hasta;
}

/** «Cada N días»: entero de 1 a 62 (spec §3.1). Sin N válido no hay forma de cortar el pago. */
export function validarCadaDias(n: unknown): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 62) {
    throw new Error(`«Cada N días»: N tiene que ser un entero entre 1 y 62, llegó: ${String(n)}.`);
  }
  return n;
}

/**
 * DEFAULT (spec §3.1, anotado en docs/pendientes-negocio.md): la quincena está ANCLADA al día de
 * inicio de la frecuencia, no a 1–15 / 16–fin de mes. Con ancla el día `d`, cada mes tiene dos
 * pagos: del día `d` al `d + 14`, y del `d + 15` al día anterior a `d` del mes siguiente. Si el mes
 * es corto el día de ancla se recorta al último día (31 → 28), igual que la modalidad mensual.
 * Devuelve el fin de la quincena que CONTIENE `desde`.
 */
function finDeQuincena(desde: string, ancla: string): string {
  const desdeMs = msDeFecha(validarFecha(desde, 'finDePeriodo: desde'));
  const [ay, am, ad] = validarFecha(ancla, 'finDePeriodo: ancla').split('-').map(Number);
  const inicioDeMes = (k: number): number => {
    const dia = Math.min(ad, ultimoDiaDelMes(ay, am - 1 + k));
    return Date.UTC(ay, am - 1 + k, dia);
  };
  if (desdeMs < inicioDeMes(0)) {
    throw new Error(`finDePeriodo: ${desde} es anterior al ancla de la quincena (${ancla}).`);
  }
  for (let k = 0; ; k++) {
    const ini = inicioDeMes(k);
    const finPrimera = ini + 14 * MS_DIA;
    if (desdeMs <= finPrimera) return fmtFecha(finPrimera);
    const finSegunda = inicioDeMes(k + 1) - MS_DIA;
    if (desdeMs <= finSegunda) return fmtFecha(finSegunda);
  }
}

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((msDeFecha(hasta) - msDeFecha(desde)) / MS_DIA) + 1;

/**
 * La cuota de un tramo que va de `desde` a `hasta`. Un tramo completo cobra la cuota entera; uno
 * MÁS CORTO que la frecuencia (el último del contrato, spec §3.3) se prorratea por días contra el
 * período completo que arrancaba en `desde`. DEFAULT anotado en docs/pendientes-negocio.md. OJO: hoy
 * NO hay pantalla para ajustar esa cuota antes de confirmar (la spec §3.3 lo pide; ver el PR).
 */
export function cuotaDelTramo(
  cuota: number,
  desde: string,
  hasta: string,
  frecuencia: ModalidadPago | FrecuenciaPago,
  ancla?: string,
): number {
  const completo = finDePeriodo(desde, frecuencia, undefined, ancla);
  if (hasta >= completo || cierraEnAniversario(hasta, frecuencia, ancla)) return cuota;
  return r2((cuota * diasEntre(desde, hasta)) / diasEntre(desde, completo));
}

/**
 * Enmienda 9.1 de la spec (auditoría D-2). El calendario mensual se corre en los meses cortos
 * (31-ene → 28-feb, 1-mar → 31-mar…), así que un tramo que termina el día anterior a un ANIVERSARIO
 * del día de inicio de la frecuencia parece corto sin serlo. Decisión del dueño (06-oct): la mensual
 * se cuenta desde el día en que empezó el contrato. Sólo decide si el tramo es corto: los cortes del
 * calendario no cambian. Sin ancla (llamadas viejas) no hay aniversario que mirar.
 */
function cierraEnAniversario(
  hasta: string,
  frecuencia: ModalidadPago | FrecuenciaPago,
  ancla: string | undefined,
): boolean {
  const modalidad = typeof frecuencia === 'string' ? frecuencia : frecuencia.modalidad;
  if (modalidad !== 'mensual' || ancla === undefined) return false;
  const diaAncla = Number(validarFecha(ancla, 'cuotaDelTramo: ancla').slice(8, 10));
  const [y, m, d] = fmtFecha(msDeFecha(hasta) + MS_DIA).split('-').map(Number);
  return d === Math.min(diaAncla, ultimoDiaDelMes(y, m - 1));
}

/** Los datos de pago de un contrato: lo que vive en `sueldo_acuerdos`. */
export interface ContratoPago extends FrecuenciaPago {
  fechaInicio: string;
  fechaFin: string;
  sueldoPactado: number;
}

/** Una fila de `sueldo_acuerdo_cambios`: frecuencia y cuota válidas DESDE esa fecha. */
export interface CambioFrecuencia extends FrecuenciaPago {
  desde: string;
  sueldoPactado: number;
}

export interface FrecuenciaVigente extends FrecuenciaPago {
  sueldoPactado: number;
  /** Fecha en que arrancó esta frecuencia: de ahí se cortan las quincenas. */
  ancla: string;
}

/** La última fila con `desde <= fecha`; sin filas, la del contrato (spec §4). */
export function frecuenciaVigente(
  contrato: ContratoPago,
  cambios: CambioFrecuencia[],
  fecha: string,
): FrecuenciaVigente {
  let vigente: FrecuenciaVigente = {
    modalidad: contrato.modalidad,
    cadaDias: contrato.cadaDias ?? null,
    sueldoPactado: contrato.sueldoPactado,
    ancla: contrato.fechaInicio,
  };
  const orden = [...cambios].sort((a, b) => a.desde.localeCompare(b.desde));
  for (const c of orden) {
    if (c.desde <= fecha) {
      // Si la frecuencia sigue siendo quincenal, el ancla sigue siendo la de antes: cambiar sólo la
      // cuota no puede correr los días de corte (10/25 pasarían a 25/9).
      const mismaQuincena = c.modalidad === 'quincenal' && vigente.modalidad === 'quincenal';
      vigente = {
        modalidad: c.modalidad,
        cadaDias: c.cadaDias ?? null,
        sueldoPactado: c.sueldoPactado,
        ancla: mismaQuincena ? vigente.ancla : c.desde,
      };
    }
  }
  return vigente;
}

export interface PagoCalendario extends FrecuenciaPago {
  desde: string;
  hasta: string;
  dias: number;
  /** Cuota de este tramo (prorrateada si es corto). */
  cuota: number;
  /** Cuota de un pago completo de la frecuencia vigente. */
  cuotaCompleta: number;
  /** true si el tramo es más corto que la frecuencia (último pago o cortado por un cambio). */
  corto: boolean;
}

/**
 * La línea de tiempo de pagos del contrato: la que alimenta la vista previa, `sugerirRango` y la
 * cuota que recibe el motor. Los tramos son consecutivos, sin huecos, y el último termina en
 * `fechaFin`. Un cambio nunca parte un tramo ya empezado salvo defensivamente (si `desde` no cae en
 * el límite de un pago): en ese caso el tramo se corta y se prorratea.
 */
export function calendarioDePagos(contrato: ContratoPago, cambios: CambioFrecuencia[]): PagoCalendario[] {
  validarFecha(contrato.fechaInicio, 'calendarioDePagos: fechaInicio');
  validarFecha(contrato.fechaFin, 'calendarioDePagos: fechaFin');
  const pagos: PagoCalendario[] = [];
  let cursor = contrato.fechaInicio;
  while (cursor <= contrato.fechaFin) {
    const v = frecuenciaVigente(contrato, cambios, cursor);
    const natural = finDePeriodo(cursor, v, undefined, v.ancla);
    const proximoCambio = cambios.map((c) => c.desde).filter((d) => d > cursor).sort()[0];
    let hasta = natural < contrato.fechaFin ? natural : contrato.fechaFin;
    if (proximoCambio !== undefined) {
      const antes = fmtFecha(msDeFecha(proximoCambio) - MS_DIA);
      if (antes < hasta) hasta = antes;
    }
    pagos.push({
      desde: cursor,
      hasta,
      dias: diasEntre(cursor, hasta),
      cuota: cuotaDelTramo(v.sueldoPactado, cursor, hasta, v, v.ancla),
      cuotaCompleta: v.sueldoPactado,
      corto: hasta < natural && !cierraEnAniversario(hasta, v, v.ancla),
      modalidad: v.modalidad,
      cadaDias: v.cadaDias ?? null,
    });
    cursor = fmtFecha(msDeFecha(hasta) + MS_DIA);
  }
  return pagos;
}

/**
 * La cuota que recibe `liquidarPeriodo` (`entrada.sueldoPactado`) para liquidar `desde`–`hasta`.
 * El motor no cambia de fórmula: sólo recibe la cuota correcta.
 *
 * - Un tramo cobra la cuota VIGENTE en `desde` entera, como siempre: el administrador puede elegir
 *   un rango que no coincide con la frecuencia y eso no prorratea nada (regresión, spec §7.6).
 * - Sólo el ÚLTIMO tramo (termina en `fechaFin` o justo antes de un cambio de frecuencia), si es más
 *   corto que la frecuencia, se prorratea por días (spec §3.3, default anotado en
 *   docs/pendientes-negocio.md). Un tramo mensual que termina antes de un aniversario del inicio
 *   no es corto (enmienda 9.1).
 * - Un rango alineado con varios pagos del calendario cobra la suma de sus cuotas; uno desalineado
 *   que cruza un cambio de frecuencia se rechaza (enmienda 9.2).
 */
export function cuotaDeLiquidacion(
  contrato: ContratoPago,
  cambios: CambioFrecuencia[],
  desde: string,
  hasta: string,
): number {
  // Enmienda 9.2 (auditoría D-4): un rango que cubre VARIOS pagos del calendario.
  const cubiertos = calendarioDePagos(contrato, cambios).filter((p) => p.desde <= hasta && p.hasta >= desde);
  if (cubiertos.length > 1) {
    const ultimo = cubiertos[cubiertos.length - 1];
    // Alineado con los bordes: una cuota por pago (`sueldo_pactado` es la cuota de CADA pago).
    if (cubiertos[0].desde === desde && ultimo.hasta === hasta) {
      return r2(cubiertos.reduce((s, p) => s + p.cuota, 0));
    }
    // Desalineado y cruzando un cambio de frecuencia: no hay una cuota que tenga sentido.
    if (cambios.some((c) => c.desde > desde && c.desde <= hasta)) {
      throw new Error(
        `El rango ${desde} a ${hasta} cruza un cambio de frecuencia y no coincide con los pagos del calendario ` +
          `(${cubiertos.map((p) => `${p.desde} a ${p.hasta}`).join(', ')}). Liquida cada pago por separado.`,
      );
    }
    // Desalineado sin cambio de por medio: como antes (§7.6), la cuota vigente entera.
  }
  const v = frecuenciaVigente(contrato, cambios, desde);
  const natural = finDePeriodo(desde, v, undefined, v.ancla);
  // Mismo criterio de corte que calendarioDePagos(): el fin del contrato o el día antes del próximo
  // cambio, lo que llegue primero. Un tramo cortado ahí se prorratea igual que en la vista previa.
  let corte = contrato.fechaFin;
  const proximoCambio = cambios.map((c) => c.desde).filter((d) => d > desde).sort()[0];
  if (proximoCambio !== undefined) {
    const antes = fmtFecha(msDeFecha(proximoCambio) - MS_DIA);
    if (antes < corte) corte = antes;
  }
  if (hasta === corte && hasta < natural) {
    return cuotaDelTramo(v.sueldoPactado, desde, hasta, v, v.ancla);
  }
  return v.sueldoPactado;
}

/**
 * El primer pago del calendario que arranca DESPUÉS de lo último pagado (`ultimaCerradaHasta`,
 * null si nada se pagó): ahí y sólo ahí puede empezar un cambio de frecuencia (spec §3.2, «desde el
 * próximo pago que todavía no se pagó»). Null si ya está todo pagado.
 */
export function proximoPagoPendiente(
  contrato: ContratoPago,
  cambios: CambioFrecuencia[],
  ultimaCerradaHasta: string | null,
): PagoCalendario | null {
  const pagos = calendarioDePagos(contrato, cambios);
  return pagos.find((p) => ultimaCerradaHasta === null || p.desde > ultimaCerradaHasta) ?? null;
}

/**
 * Los borradores que un cambio de frecuencia a partir de `desde` deja desactualizados (spec §3.2):
 * los que todavía cubren días desde esa fecha. Las cerradas no se tocan nunca y las anuladas ya
 * no cuentan.
 */
export function liquidacionesCruzadas<T extends { estado: string; periodoHasta: string }>(
  liquidaciones: T[],
  desde: string,
): T[] {
  return liquidaciones.filter((l) => l.estado === 'borrador' && l.periodoHasta >= desde);
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

/**
 * La hora a la que la persona llegó ese día: el ingreso del primer tramo (RN-08 con C-01).
 *
 * Se mira `horaIngreso` primero porque es lo que emite la RPC y lo que carga el administrador a
 * mano; los `tramos` son el respaldo para una fila que venga sólo con ellos. Devuelve `null`
 * cuando no hay ningún ingreso, que es como se declara una falta.
 */
function primerIngreso(r: RegistroAsistencia): string | null {
  if (r.horaIngreso != null && r.horaIngreso !== '') return r.horaIngreso;
  for (const t of r.tramos ?? []) {
    if (t.ingreso != null && t.ingreso !== '') return t.ingreso;
  }
  return null;
}

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

/** `1200` → «1.200»; `0.05` → «0,05». Hasta `decimales` decimales, sin ceros de relleno. */
function fmtEs(n: number, decimales = 2): string {
  const [ent, dec = ''] = (Math.round(n * 10 ** decimales) / 10 ** decimales).toFixed(decimales).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = dec.replace(/0+$/, '');
  return resto ? `${miles},${resto}` : miles;
}

/**
 * Bono por puntos (pago por puntos, spec 2026-10-05-pago-por-puntos-design.md §3 y §8.2):
 * suma, sobre cada mes del contrato que cierra en este tramo, de
 * `round2(max(0, puntos del mes − meta del mes) × soles por punto)`; `null` si no hay línea.
 *
 * La meta es mensual y se mide por mes del contrato. Un mes completo usa la meta ENTERA; sólo el
 * último mes, cortado por el fin del contrato, la prorratea por días contra el mes completo
 * (`meta × días efectivos ÷ días del mes`). Ese prorrateo es un DEFAULT no confirmado por el dueño
 * (docs/pendientes-negocio.md). El excedente se redondea antes de multiplicar (D-12).
 *
 * Nunca resta: los puntos ya vienen netos de incidencias y si quedan bajo la meta el bono es 0.
 */
function bonoPorPuntos(
  entrada: EntradaLiquidacion,
  p: ParametrosSueldo,
  advertencias: string[],
): { monto: number; detalle: string } | null {
  if (p.puntosMetaMensual === null || p.solesPorPunto === null) return null;
  const meses = entrada.puntosMeses;
  if (meses === undefined || meses === null) {
    advertencias.push('El pago por puntos está activo pero esta entrada no trae los puntos de los meses del contrato: no se pagó nada por puntos.');
    return null;
  }
  let total = 0;
  const detalles: string[] = [];
  for (const mes of meses) {
    if (typeof mes.puntos !== 'number' || !Number.isFinite(mes.puntos)) {
      throw new Error(`Los puntos del mes tienen que ser un número, llegó: ${String(mes.puntos)}.`);
    }
    const diasEfectivos = diasDelPeriodo(mes.desde, mes.hasta).length;
    const diasMes = diasDelPeriodo(mes.desde, mes.hastaMes).length;
    const metaMes = (p.puntosMetaMensual * diasEfectivos) / diasMes;
    // El excedente se redondea ANTES de multiplicar: es el que se muestra en el detalle, y el monto
    // tiene que salir de lo que la persona lee en su comprobante (spec §8.2, D-12).
    const excedente = r2(Math.max(0, mes.puntos - metaMes));
    const montoMes = r2(excedente * p.solesPorPunto);
    total += montoMes;
    detalles.push(
      `${fmtEs(mes.puntos)} puntos − meta ${fmtEs(metaMes)} = ${fmtEs(excedente)} × S/${fmtEs(p.solesPorPunto, 4)}`,
    );
  }
  const monto = r2(total);
  if (monto <= 0) return null;
  return { monto, detalle: detalles.join('; ') };
}

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

  /**
   * RN-05 (C-01): las horas del día son la **suma de los tramos continuos**, no la resta entre la
   * primera entrada y la última salida. Una pausa —salir y volver— no se paga.
   *
   * Los cuatro pasos, y ninguno es decorativo:
   *
   * 1. Sin `tramos`, el par `horaIngreso`/`horaSalida` **es** el único tramo. Un día normal pasa
   *    por acá y sale con el mismo número de siempre.
   * 2. Un tramo con un solo lado vale 0 y avisa. Es el error de marcación más común —marcó la
   *    entrada y se fue sin marcar la salida— y pasarlo en silencio le come el día y el almuerzo.
   * 3. Se ordenan y se **fusionan** los que se pisan o los separados por menos de
   *    `pausaMinimaMinutos`. Este paso evita dos errores opuestos: sumar a ciegas dos filas que se
   *    pisan (una cargada a mano 09:00-20:00 y otra dejada por un reporte 13:00-20:00) daría 18
   *    horas de un día de 11 y **pagaría de más**; y no fusionar lo pegado convierte dos marcas a
   *    las 09:00 y 09:02 en una pausa de dos minutos que **paga de menos**.
   * 4. Se suman las duraciones.
   */
  const horasDelRegistro = (r: RegistroAsistencia, donde: string): number => {
    const crudos: TramoTrabajado[] =
      r.tramos && r.tramos.length > 0 ? r.tramos : [{ ingreso: r.horaIngreso, salida: r.horaSalida }];

    // Paso 1 y 2: a minutos, descartando los que tienen un solo lado.
    const intervalos: { ini: number; fin: number }[] = [];
    let mancos = 0;
    let ultimoManco: 'ingreso sin salida' | 'salida sin ingreso' = 'ingreso sin salida';
    for (const t of crudos) {
      const tieneIngreso = t.ingreso != null && t.ingreso !== '';
      const tieneSalida = t.salida != null && t.salida !== '';
      if (tieneIngreso !== tieneSalida) {
        mancos += 1;
        ultimoManco = tieneIngreso ? 'ingreso sin salida' : 'salida sin ingreso';
        continue;
      }
      if (!tieneIngreso) continue; // RN-05: ninguno de los dos lados = 0 horas, sin aviso
      const ini = minutosDeHora(t.ingreso, `${donde} ${r.fecha}`);
      const fin = minutosDeHora(t.salida, `${donde} ${r.fecha}`);
      if (fin <= ini) {
        throw new Error(`${donde} ${r.fecha}: la salida (${t.salida}) no es posterior al ingreso (${t.ingreso}).`);
      }
      intervalos.push({ ini, fin });
    }
    if (mancos > 0) {
      advertencias.push(
        mancos === 1
          ? `${donde} ${r.fecha}: tiene ${ultimoManco}. Cuenta como 0 horas.`
          : `${donde} ${r.fecha}: tiene ${mancos} tramo(s) con un solo lado (entrada sin salida o al revés). Cuentan como 0 horas.`,
      );
    }
    if (intervalos.length === 0) return 0; // RN-05

    // Paso 3: ordenar y fusionar. `pausaMinimaMinutos` es lo que separa "se fue" de "marcó dos
    // veces"; con 0, cualquier hueco se descuenta.
    intervalos.sort((a2, b2) => a2.ini - b2.ini);
    const umbral = p.pausaMinimaMinutos;
    const unidos: { ini: number; fin: number }[] = [intervalos[0]];
    let pausasDescontadas = 0;
    let minutosDePausa = 0;
    for (let i = 1; i < intervalos.length; i += 1) {
      const actual = intervalos[i];
      const previo = unidos[unidos.length - 1];
      const hueco = actual.ini - previo.fin;
      if (hueco < umbral) {
        // Se pisan o están pegados: un solo tramo. `Math.max` importa cuando uno está contenido
        // dentro del otro — sin él, la fila más corta acortaría a la más larga.
        previo.fin = Math.max(previo.fin, actual.fin);
      } else {
        pausasDescontadas += 1;
        minutosDePausa += hueco;
        unidos.push({ ...actual });
      }
    }
    if (pausasDescontadas > 0) {
      // Se avisa siempre, aunque sea correcto: es plata que alguien esperaba cobrar y que no va a
      // ver en el desglose, porque el desglose muestra horas y no huecos.
      advertencias.push(
        `${donde} ${r.fecha}: ${pausasDescontadas} pausa(s) que suman ${r2(minutosDePausa)} minuto(s) no se pagan (RN-05).`,
      );
    }

    // Paso 4.
    return unidos.reduce((suma, t) => suma + (t.fin - t.ini), 0) / 60;
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
      // El ingreso del PRIMER tramo (C-01). Una pausa no hace que alguien llegue tarde dos veces,
      // y una fila que traiga sólo `tramos` no puede leerse como falta por no traer `horaIngreso`.
      const ingreso = reg ? primerIngreso(reg) : null;
      if (ingreso == null) {
        esFalta = true; // RN-09
      } else {
        // RN-08: el límite se deriva del horario del día + la tolerancia, no es un texto fijo.
        const limite = (contratado as DiaContratado).inicioMin + p.toleranciaMinutos;
        esTardanza = minutosDeHora(ingreso, `Asistencia ${fecha}`) > limite;
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

  // ── Aviso: la hora la puso el sistema, no una marca ni una carga a mano (migración 0098) ────
  // No cambia ningún cálculo: una hora estimada ya viaja en horaIngreso/horaSalida como cualquier
  // otra y se paga igual (spec asistencias/2026-08-25-huellero-decide-por-horario-design.md §3,
  // C-3: "el detalle de la liquidación la nombra, para que quien firma el pago sepa qué se
  // estimó"). Esto sólo junta las fechas — mismo motivo que existe la 0085: un dato que nadie
  // declaró no se paga en silencio. Se miran las dos listas de RegistroAsistencia (dentro del
  // horario contratado y fuera de él, tal como las separa `sueldo_entrada`): ambas comparten el
  // mismo tipo y la RPC arma el mismo jsonb para las dos, así que cualquiera podría traer la
  // marca. `asistencia`/`fueraDeContrato` ya están validadas por los dos bucles de arriba (sin
  // fechas repetidas ni inválidas: cualquiera de los dos habría cortado antes de llegar acá).
  const fechasConHoraEstimada = [...new Set(
    [...asistencia, ...fueraDeContrato]
      .filter((r) => enPeriodo(r.fecha) && (r.entradaEstimada === true || r.salidaEstimada === true))
      .map((r) => r.fecha),
  )].sort();
  if (fechasConHoraEstimada.length > 0) {
    advertencias.push(
      `${fechasConHoraEstimada.length} día(s) tienen una hora puesta por el sistema, no por una marca ni una carga a mano: ${primeros(fechasConHoraEstimada)}. Revisá antes de pagar.`,
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

  const bonoPuntos = bonoPorPuntos(entrada, p, advertencias);

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
    // RN-21 (pago por puntos): sólo aparece si está activo y el período superó la meta.
    ...(bonoPuntos
      ? [{ grupo: 'ingreso' as const, concepto: 'Bono por puntos', detalle: bonoPuntos.detalle, monto: bonoPuntos.monto, regla: 'RN-21' }]
      : []),
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
      // El factor sólo se nombra en el detalle cuando no es 1, para que la boleta de la persona
      // que cobra la hora al precio de siempre no cargue con un "× 1" que no explica nada.
      detalle:
        p.factorHoraFueraContrato === 1
          ? `${r2(horasFuera)} h × S/${valorPorHora.toFixed(4)}`
          : `${r2(horasFuera)} h × S/${valorPorHora.toFixed(4)} × ${p.factorHoraFueraContrato} (factor pactado)`,
      monto: r2(horasFuera * valorPorHora * p.factorHoraFueraContrato),
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

/**
 * Conserva sólo los elementos cuya `fecha` es hoy o anterior. `hoy` lo entrega quien invoca (hora
 * Perú): el core no llama `new Date()`. Sirve para que una acción masiva no declare días futuros.
 */
export function soloHastaHoy<T extends { fecha: string }>(items: readonly T[], hoy: string): T[] {
  validarFecha(hoy, 'soloHastaHoy (hoy)');
  return items.filter((i) => validarFecha(i.fecha, 'soloHastaHoy') <= hoy);
}
