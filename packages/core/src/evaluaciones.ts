// evaluaciones.ts — nota mensual del colaborador. La fórmula y los pesos son CONFIGURABLES
// (los pesos vienen de la tabla config; aquí solo la aritmética). Cada componente va en escala /20.
// nota = Σ(componente × peso) − descuento_incidencias + bonus_ventas   (CONTEXTO-PROYECTO.md §5)

export type ComponenteKey =
  | 'competencias'
  | 'valores'
  | 'operaciones'
  | 'software'
  | 'limpieza'
  | 'examenes'
  | 'tardanza';

export const COMPONENTES: { key: ComponenteKey; label: string }[] = [
  { key: 'competencias', label: 'Competencias' },
  { key: 'valores', label: 'Valores 360°' },
  { key: 'operaciones', label: 'Operaciones' },
  { key: 'software', label: 'Software' },
  { key: 'limpieza', label: 'Limpieza' },
  { key: 'examenes', label: 'Exámenes' },
  { key: 'tardanza', label: 'Puntualidad' },
];

export type PesosEval = Record<ComponenteKey, number>;
export type ComponentesEval = Record<ComponenteKey, number> & {
  descuentoIncidencias: number;
  bonusVentas: number;
  // Cuántas evaluaciones 360° dieron `valores` en ese ciclo. Sólo se guarda (no entra en la nota):
  // la base publica el 360° de una fila guardada si llega al mínimo (0119; spec
  // 2026-10-04-evaluacion-guardar-recalculada §7).
  valoresCantidad?: number;
};

// Pesos por defecto (se sobreescriben con los de config). Suman 1.0.
export const PESOS_DEFAULT: PesosEval = {
  competencias: 0.25,
  valores: 0.25,
  operaciones: 0.1,
  software: 0.1,
  limpieza: 0.1,
  examenes: 0.15,
  tardanza: 0.05,
};

// Corta antes de devolver una nota, en vez de disfrazar un dato roto de un cero merecido: si un
// componente o un peso llega NaN, Infinity, null o undefined (división por cero aguas arriba,
// columna que volvió null, un Number('')), antes `|| 0` lo convertía en 0 sin dejar rastro y la
// nota salía creíble y equivocada. Un componente que vale 0 de verdad sigue sin lanzar nada:
// Number.isFinite(0) es true — la diferencia entre "no hizo nada" y "no sabemos" es justo lo que
// esto restaura. Ver docs/superpowers/specs/evaluaciones/2026-08-24-nota-sin-ceros-silenciosos-
// design.md (§1-A, §2 C-1).
function esNumeroValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function validarNumero(valor: number, nombre: ComponenteKey, tipo: 'componente' | 'peso'): number {
  if (!esNumeroValido(valor)) {
    throw new Error(
      `El ${tipo} "${nombre}" no es un número (${String(valor)}). La nota no se puede calcular con un dato roto.`,
    );
  }
  return valor;
}

// §7 E-1 (enmienda del 24-ago, después de la primera implementación): el descuento por incidencias
// y el bono por ventas seguían entrando con `|| 0` — el mismo agujero que C-1 tapó para los
// componentes y los pesos. Quedaron afuera porque la prosa original decía "un componente o un
// peso" y ninguno de los dos es esa cosa, pero es el mismo defecto y la misma plata: un descuento
// roto se vuelve "no hay descuento" y la persona conserva puntos que perdió por una incidencia
// real; un bono roto se vuelve "no hay bono" y la persona pierde puntos que se ganó.
function validarAjuste(valor: number, etiqueta: string): number {
  if (!esNumeroValido(valor)) {
    throw new Error(
      `El ${etiqueta} no es un número (${String(valor)}). La nota no se puede calcular con un dato roto.`,
    );
  }
  return valor;
}

/** Puede lanzar (ver validarNumero/validarAjuste): un componente, un peso, el descuento por
 *  incidencias o el bono por ventas que no es un número finito corta el cálculo en vez de devolver
 *  una nota silenciosamente equivocada. */
export function calcularNotaMensual(c: ComponentesEval, p: PesosEval): number {
  let nota = 0;
  for (const { key } of COMPONENTES) {
    nota += validarNumero(c[key], key, 'componente') * validarNumero(p[key], key, 'peso');
  }
  nota = nota
    - validarAjuste(c.descuentoIncidencias, 'descuento por incidencias')
    + validarAjuste(c.bonusVentas, 'bono por ventas');
  return Math.round(nota * 100) / 100;
}

// Los siete pesos son editables desde /configuración (así tiene que ser) y nada obliga a que
// sumen 1 — que lo hagan es la decisión 14, todavía abierta (docs/pendientes-negocio.md).
// Normalizarlos acá adentro sería inventar esa regla en silencio, que es peor que no tenerla: esto
// sólo saca la desviación a la luz para que el administrador la vea junto a la nota y decida él.
export function revisarPesos(p: PesosEval): { suma: number; desviado: boolean } {
  const total = COMPONENTES.reduce((acc, { key }) => acc + p[key], 0);
  // §7 E-3 (enmienda del 24-ago): un peso NaN vuelve NaN la suma, y `Math.abs(NaN - 1) > 0.01` da
  // false — la función afirmaba "desviado: false" justo cuando un peso estaba roto. Hoy
  // calcularNotaMensual ya corta antes de llegar acá (C-1), pero una función que miente cuando se
  // la llama sola es una trampa esperando a quien la reutilice: un peso no finito desvía la nota
  // igual que cualquier otro peso roto.
  const algunPesoRoto = COMPONENTES.some(({ key }) => !Number.isFinite(p[key]));
  // 0.01 de tolerancia: los siete pesos son decimales y la suma en coma flotante no siempre cae
  // en exactamente 1, aunque matemáticamente sí sumen 1 (p. ej. 0.1+0.2+0.15+0.15+0.1+0.2+0.1).
  return { suma: Math.round(total * 100) / 100, desviado: algunPesoRoto || Math.abs(total - 1) > 0.01 };
}

// Tardanza → nota /20 (CONTEXTO-PROYECTO.md §5): max(0, 20 − floor(min_total / minPorPunto)).
export function notaTardanza(minutosTotales: number, minPorPunto = 15): number {
  const div = minPorPunto > 0 ? minPorPunto : 15;
  return Math.max(0, 20 - Math.floor((minutosTotales || 0) / div));
}

export type TramoEval = 'excelente' | 'bueno' | 'mejorar' | 'bajo';

export function tramoEval(nota: number): TramoEval {
  if (nota >= 17) return 'excelente';
  if (nota >= 14) return 'bueno';
  if (nota >= 11) return 'mejorar';
  return 'bajo';
}

export const TRAMO_LABEL: Record<TramoEval, string> = {
  excelente: 'Excelente',
  bueno: 'Buen desempeño',
  mejorar: 'Requiere mejorar',
  bajo: 'Bajo rendimiento',
};

// ── Puntos como moneda (spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-
// design.md) ──────────────────────────────────────────────────────────────────────────────────
// Desde el 25-ago-2026 la nota mensual deja de ser sólo Σ(componente × peso) y pasa a poder leerse
// también desde los PUNTOS acumulados del período (pipeline + extras + actividades + ventas −
// incidencias, sumados por el RPC private.evaluacion_componentes_datos). calcularNotaMensual() de
// arriba NO se toca — evaluaciones ya guardadas con metodo='ponderado' se siguen mostrando con esa
// fórmula (spec §2 C-5) — esto es un camino nuevo y paralelo, no un reemplazo.

/** Las cuatro bandas de C-3. El orden de los cortes es riesgo < en_desarrollo < ideal < sobresaliente. */
export type BandaEval = 'riesgo' | 'en_desarrollo' | 'ideal' | 'sobresaliente';

export const BANDA_LABEL: Record<BandaEval, string> = {
  riesgo: 'Riesgo',
  en_desarrollo: 'En desarrollo',
  ideal: 'Ideal',
  sobresaliente: 'Sobresaliente',
};

// Los cinco números de la recta quebrada + las bandas, todos editables desde /configuración
// (config-catalogo.ts, sección "Evaluación mensual") — nada queda quemado acá.
export type EscalaPuntos = {
  puntosPromedio: number; // spec: el ejemplo del administrador es 5000 → notaPromedio
  notaPromedio: number; // spec: 16
  puntosExcelente: number; // spec: 7500 → nota 20
  bandaRiesgo: number; // spec: <13 "riesgo de despido"
  bandaIdeal: number; // spec: >18 "ideal y perfección"
};

// El corte entre 'ideal' y 'sobresaliente' NO es un parámetro de config: es la nota 20 en sí misma
// ("si pasa de 7500 es mayor todavía... es alguien sobresaliente"), la misma ancla que ya fija
// notaDesdePuntos(). Los dos cortes editables son sólo bandaRiesgo y bandaIdeal (spec §2 C-3).
//
// Exportada aparte (no sólo usada adentro de notaDesdePuntos): las evaluaciones YA GUARDADAS
// (metodo='ponderado' o 'puntos', spec §2 C-5) tienen su nota_final congelada — clasificarla en
// una banda para mostrarla en el historial/mi-desempeño no debe recalcular puntos → nota de nuevo
// (eso podría dar una nota DISTINTA a la que se guardó si la escala de config cambió desde
// entonces), sólo leer el número ya congelado contra los cortes ACTUALES de bandaRiesgo/bandaIdeal
// — mismo espíritu que ya usa tramoEval(nota) para el sistema viejo.
export function bandaDesdeNota(nota: number, bandaRiesgo: number, bandaIdeal: number): BandaEval {
  if (nota < bandaRiesgo) return 'riesgo';
  if (nota > 20) return 'sobresaliente';
  if (nota >= bandaIdeal) return 'ideal';
  return 'en_desarrollo';
}

/**
 * Puntos → nota /20, spec §2 C-2/C-3. Recta quebrada con el codo en `puntosPromedio` (dos anclas:
 * el promedio da `notaPromedio`, `puntosExcelente` da 20) y SIN techo — pasar de `puntosExcelente`
 * sigue subiendo la nota más allá de 20 (eso es "sobresaliente", C-3), a diferencia de
 * calcularNotaMensual() que nunca pasaba de 20 en la práctica.
 *
 *   puntos ≤ puntosPromedio:  nota = puntos / puntosPromedio × notaPromedio
 *   puntos >  puntosPromedio: nota = notaPromedio + (puntos − puntosPromedio) × (20 − notaPromedio)
 *                                                    / (puntosExcelente − puntosPromedio)
 *
 * La nota nunca es negativa (puntos negativos por incidencias que superan el trabajo del período
 * dan 0,00, no un número negativo — spec §7 caso 7): se recorta ANTES de redondear.
 *
 * Puede lanzar: si `puntosExcelente === puntosPromedio` la segunda pendiente divide por cero, y si
 * `puntosPromedio === 0` es la primera la que divide por cero — mismo defecto en las dos ramas de
 * la misma recta. Antes de este chequeo el resultado sería Infinity/NaN en silencio; se corta con
 * un mensaje claro, mismo principio que ya sigue calcularNotaMensual con esNumeroValido/
 * validarNumero: un dato de config roto no se disfraza de resultado (spec §7 caso 8).
 */
export function notaDesdePuntos(puntos: number, escala: EscalaPuntos): { nota: number; banda: BandaEval } {
  const { puntosPromedio, notaPromedio, puntosExcelente, bandaRiesgo, bandaIdeal } = escala;
  const campos: [string, number][] = [
    ['puntos', puntos],
    ['puntosPromedio', puntosPromedio],
    ['notaPromedio', notaPromedio],
    ['puntosExcelente', puntosExcelente],
    ['bandaRiesgo', bandaRiesgo],
    ['bandaIdeal', bandaIdeal],
  ];
  for (const [nombre, valor] of campos) {
    if (!esNumeroValido(valor)) {
      throw new Error(`"${nombre}" no es un número (${String(valor)}). La nota no se puede calcular con un dato roto.`);
    }
  }
  if (puntosExcelente === puntosPromedio) {
    throw new Error(
      `La escala de puntos no es válida: puntosExcelente y puntosPromedio son iguales (${puntosPromedio}). La segunda mitad de la recta no tiene pendiente — no se puede calcular la nota sin dividir por cero.`,
    );
  }
  if (puntosPromedio === 0) {
    throw new Error(
      'La escala de puntos no es válida: puntosPromedio es 0. La primera mitad de la recta no se puede calcular sin dividir por cero.',
    );
  }

  const nota =
    puntos <= puntosPromedio
      ? (puntos / puntosPromedio) * notaPromedio
      : notaPromedio + ((puntos - puntosPromedio) * (20 - notaPromedio)) / (puntosExcelente - puntosPromedio);

  const notaFinal = Math.round(Math.max(0, nota) * 100) / 100;
  return { nota: notaFinal, banda: bandaDesdeNota(notaFinal, bandaRiesgo, bandaIdeal) };
}

/** Salida de la RPC `evaluacion_componentes` para un empleado y un ciclo (sólo lo que se usa acá). */
export type ComponentesDeData = {
  operaciones: number;
  software: number;
  limpieza: number;
  tardanza: number;
  valores: number | null;
  valoresCantidad?: number | null;
  descuento: number;
  bonusVentas: number;
  puntosTotal?: number;
  ventasSinTasa?: boolean;
};

/** Lo único que el cliente aporta al guardar: juicio humano y entradas manuales de la pantalla. */
export type EntradaManualEval = {
  competencias: number;
  examenes: number;
};

/**
 * Arma lo que se guarda en `evaluaciones_mensuales` a partir de la salida de la RPC del ciclo EXACTO
 * que se guarda (spec 2026-10-04-evaluacion-guardar-recalculada §2). La nota y los puntos NUNCA
 * vienen del cliente; los componentes automáticos tampoco. No cambia ninguna fórmula: la nota es
 * notaDesdePuntos() tal cual. Lanza si falta puntosTotal, si hay ventas sin tasa, si la escala está
 * rota o si una entrada manual no es válida — mismos bloqueos que ya aplica la pantalla.
 */
export function armarEvaluacionAGuardar(
  data: ComponentesDeData,
  escala: EscalaPuntos,
  manual: EntradaManualEval,
): { notaFinal: number; banda: BandaEval; puntosTotal: number; componentes: ComponentesEval } {
  if (!esNumeroValido(data.puntosTotal)) {
    throw new Error('No se pudieron calcular los puntos del período (¿falta aplicar la migración 0095?). No se guarda.');
  }
  if (data.ventasSinTasa === true) {
    throw new Error('Hay ventas en el período y no está definido cuántos puntos vale un sol vendido. No se guarda.');
  }
  for (const k of ['competencias', 'examenes'] as const) {
    const v = manual[k];
    if (!esNumeroValido(v) || v < 0 || v > 20) {
      throw new Error(`"${k}" debe ser un número entre 0 y 20 (${String(v)}).`);
    }
  }
  const automaticos = {
    operaciones: data.operaciones,
    software: data.software,
    limpieza: data.limpieza,
    tardanza: data.tardanza,
    descuentoIncidencias: data.descuento,
    bonusVentas: data.bonusVentas,
  };
  for (const [k, v] of Object.entries(automaticos)) {
    if (!esNumeroValido(v)) throw new Error(`"${k}" del cálculo no es un número (${String(v)}).`);
  }
  const { nota, banda } = notaDesdePuntos(data.puntosTotal, escala);
  return {
    notaFinal: nota,
    banda,
    puntosTotal: data.puntosTotal,
    componentes: {
      ...automaticos,
      valores: data.valores ?? 0,
      // Sale de la RPC, nunca del cliente. Sin dato → 0: la base no publica un 360° sin saber con
      // cuántos votos se calculó (spec §7, H-6).
      valoresCantidad: esNumeroValido(data.valoresCantidad) ? data.valoresCantidad : 0,
      competencias: manual.competencias,
      examenes: manual.examenes,
    },
  };
}

// ── Ciclo por aniversario (Fase 12 tarea 3) ──────────────────────────────────────────────────
// Puerto literal de calcularCiclo() en routes/evaluaciones.js:98-127 (sistema viejo, nunca
// migrado): el periodo de evaluación arranca el día del mes de `fecha_ingreso` (aniversario) y
// termina el día anterior al próximo aniversario. Sin fecha_ingreso válida → fallback a mes
// calendario (1º al último día del mes de "hoy"), igual que el original.
//
// Aritmética: se usa Date.UTC (no `new Date(y,m,d)` local) para que el resultado NUNCA dependa
// de la zona horaria del proceso que ejecuta esto (el server viejo corría con TZ fija; aquí no se
// puede asumir).
//
// Mes corto (aniversario en día 29/30/31 contra un mes que no llega a ese día): hasta el 24-ago-
// 2026 esto dejaba que Date.UTC desbordara el día inexistente al mes siguiente (aniversario 31,
// ciclo que cae en febrero → arrancaba/terminaba el 3 de marzo, en vez de recortar al 28).
// Alexander confirmó que la regla real es la que ya usaba en su Excel antes de este sistema: el
// ciclo se RECORTA al último día real del mes, nunca se corre. Ver spec
// docs/superpowers/specs/evaluaciones/2026-08-24-ciclo-aniversario-mes-corto-design.md — cierra
// (sin actualizar todavía el texto) el pendiente anotado en docs/pendientes-negocio.md sobre esta
// misma rareza.
export type FuenteCiclo = 'aniversario' | 'mes_calendario';
export interface Ciclo {
  desde: string;
  hasta: string;
  fuente: FuenteCiclo;
}

const fmtUTC = (t: number): string => new Date(t).toISOString().slice(0, 10);

// El día 0 del mes siguiente a (y, m0) es el último día real de (y, m0). Aritmética pura sobre un
// timestamp ya construido con Date.UTC — no lee el reloj del sistema, así que no es el
// `new Date()` que el core tiene prohibido.
const ultimoDiaDelMes = (y: number, m0: number): number =>
  new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** hoyStr: 'YYYY-MM-DD' (pasar hoyPeru() desde el caller — el core no llama a `new Date()`). */
export function calcularCiclo(fechaIngreso: string | null | undefined, hoyStr: string): Ciclo {
  const [hy, hm, hd] = hoyStr.split('-').map(Number);
  const fechaIng = (fechaIngreso ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIng)) {
    // Fallback: mes calendario (routes/evaluaciones.js:106-111).
    const desde = fmtUTC(Date.UTC(hy, hm - 1, 1));
    const hasta = fmtUTC(Date.UTC(hy, hm, 0)); // día 0 del mes siguiente = último día del actual
    return { desde, hasta, fuente: 'mes_calendario' };
  }

  const dInicio = Number(fechaIng.slice(8, 10));
  let y = hy;
  let m = hm - 1; // 0-indexado, como el original (getMonth())
  if (hd < dInicio) {
    // Todavía no llegamos al aniversario de este mes → el ciclo arrancó el mes pasado.
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }

  // Recorte de mes corto (spec 2026-08-24-ciclo-aniversario-mes-corto-design.md §3): si el mes
  // donde arranca el ciclo no llega al día de aniversario, el ciclo arranca el último día real de
  // ese mes en vez de que Date.UTC lo desborde al mes siguiente.
  const diaDesde = Math.min(dInicio, ultimoDiaDelMes(y, m));
  const desde = fmtUTC(Date.UTC(y, m, diaDesde));

  // "El día antes del próximo aniversario", recortado al último día real del mes siguiente cuando
  // ese mes no llega a (día de aniversario − 1). El día correcto se calcula ANTES de llamar a
  // Date.UTC — restarle milisegundos a una fecha ya construida (como hacía la versión anterior)
  // es exactamente lo que reintroducía el desborde que esto corrige.
  const diaHasta = Math.min(dInicio - 1, ultimoDiaDelMes(y, m + 1));
  const hasta = fmtUTC(Date.UTC(y, m + 1, diaHasta));

  return { desde, hasta, fuente: 'aniversario' };
}
