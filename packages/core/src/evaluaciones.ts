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
function esNumeroValido(valor: number): boolean {
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

// ── Ciclo por aniversario (Fase 12 tarea 3) ──────────────────────────────────────────────────
// Puerto literal de calcularCiclo() en routes/evaluaciones.js:98-127 (sistema viejo, nunca
// migrado): el periodo de evaluación arranca el día del mes de `fecha_ingreso` (aniversario) y
// termina el día anterior al próximo aniversario. Sin fecha_ingreso válida → fallback a mes
// calendario (1º al último día del mes de "hoy"), igual que el original.
//
// Aritmética: se usa Date.UTC (no `new Date(y,m,d)` local) para que el resultado NUNCA dependa
// de la zona horaria del proceso que ejecuta esto (el server viejo corría con TZ fija; aquí no se
// puede asumir). El comportamiento de "normalización de calendario" de JS (p. ej. día 31 en un
// mes de 30 días rueda al mes siguiente) es el MISMO en Date.UTC que en Date local — se preserva
// tal cual el original, incluida esa rareza de bordes de mes (ver docs/pendientes-negocio.md).
export type FuenteCiclo = 'aniversario' | 'mes_calendario';
export interface Ciclo {
  desde: string;
  hasta: string;
  fuente: FuenteCiclo;
}

const MS_DIA = 24 * 60 * 60 * 1000;
const fmtUTC = (t: number): string => new Date(t).toISOString().slice(0, 10);

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
  const desde = fmtUTC(Date.UTC(y, m, dInicio));
  const hasta = fmtUTC(Date.UTC(y, m + 1, dInicio) - MS_DIA); // día antes del próximo aniversario
  return { desde, hasta, fuente: 'aniversario' };
}
