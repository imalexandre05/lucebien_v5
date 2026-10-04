// porcentaje.ts — conversión entre lo que una persona escribe en pantalla y lo que se guarda.
//
// La comisión se GUARDA como fracción (`0.015`) porque así la multiplica el motor (RN-13,
// `packages/core/src/sueldos.ts`) y así vive en `config.sueldo_pct_comision` y en
// `parametros.pctComision` del contrato. Pero se ESCRIBE como porcentaje (`1.5`): pedir la fracción
// hacía que quien tipeaba `1.50` pensando en 1,5 % recibiera un rechazo (ticket tablero#1).
// Spec: docs/superpowers/specs/sueldos/2026-10-03-comision-en-porcentaje-design.md
//
// Todo trabaja sobre TEXTO, no sobre `number`: el campo conserva lo que se tipea (`1.50`, `2.0`) y
// el número se deriva de ahí. Al revés —guardar `Number(texto)` y devolverlo con `String()`— el
// campo se reescribía mientras se escribía y los ceros finales desaparecían.

export type Lectura = { ok: true; valor: number | null } | { ok: false; error: string };

// Sólo dígitos con un separador decimal opcional (punto o coma). Sin signo, sin exponente, sin
// `Infinity`: `Number()` acepta todo eso y aquí no tiene sentido. Admite `1.` a mitad de tipeo.
const NUMERO = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/** Escala para redondear sin arrastrar ruido de coma flotante (8 decimales de porcentaje). */
const ESCALA = 1e8;

/** Texto libre → número, con coma o punto decimal. Vacío → `null` («usa el valor global»). */
export function leerNumero(texto: string, rango: { min: number; max?: number }): Lectura {
  const t = texto.trim();
  if (t === '') return { ok: true, valor: null };
  if (!NUMERO.test(t)) return { ok: false, error: 'Escribe sólo un número, con punto o coma decimal.' };
  const n = Number(t.replace(',', '.'));
  // Más de 309 dígitos pasan la expresión y dan `Infinity`, que en jsonb se guarda como null.
  if (!Number.isFinite(n)) return { ok: false, error: 'El número es demasiado grande.' };
  if (n < rango.min) return { ok: false, error: `No puede ser menor que ${rango.min}.` };
  if (rango.max !== undefined && n > rango.max) return { ok: false, error: `No puede ser mayor que ${rango.max}.` };
  return { ok: true, valor: n };
}

/**
 * Porcentaje escrito (`1.5`, `1,50`, `2.0`) → fracción para guardar (`0.015`, `0.015`, `0.02`).
 * Rango 0–100 inclusive. El redondeo es por enteros (`round(p·1e8) / 1e10`): dividir dos enteros
 * exactos da el double más cercano al decimal, así `1.1` queda en `0.011` y no en
 * `0.011000000000000001`.
 */
export function porcentajeAFraccion(texto: string): Lectura {
  const r = leerNumero(texto, { min: 0, max: 100 });
  if (!r.ok) {
    return { ok: false, error: r.error.startsWith('Escribe') ? r.error : 'El porcentaje tiene que estar entre 0 y 100.' };
  }
  if (r.valor === null) return r;
  return { ok: true, valor: Math.round(r.valor * ESCALA) / (ESCALA * 100) };
}

/** Fracción guardada (`0.015`) → texto de porcentaje para el campo (`"1.5"`). */
export function fraccionAPorcentaje(fraccion: number): string {
  return String(Math.round(fraccion * ESCALA * 100) / ESCALA);
}

/**
 * DEFAULT DE INTERFAZ, no regla de negocio: por debajo de esta fracción (0,5 %) una comisión mayor
 * que 0 pide confirmación antes de guardarse. Existe porque hasta el 3-oct-2026 la comisión se
 * escribía como fracción, y un `0.02` tipeado por costumbre ahora significa 0,02 %, cien veces
 * menos. Decidido el 4-oct-2026, pendiente de confirmar con el cliente (docs/pendientes-negocio.md).
 * No hay mínimo: el servidor no lo aplica, sólo avisa la pantalla.
 */
export const UMBRAL_AVISO_COMISION = 0.005;

/** `true` si la comisión guardada (fracción) es mayor que 0 y menor que el umbral de aviso. */
export function comisionRequiereConfirmacion(fraccion: number | null | undefined): boolean {
  return typeof fraccion === 'number' && fraccion > 0 && fraccion < UMBRAL_AVISO_COMISION;
}

/** El aviso para una comisión muy baja, o `null` si no corresponde. Habla en porcentaje. */
export function avisoComisionBaja(fraccion: number | null | undefined): string | null {
  if (!comisionRequiereConfirmacion(fraccion)) return null;
  const f = fraccion as number;
  const escrito = fraccionAPorcentaje(f).replace('.', ',');
  // Lo que probablemente se quiso: el mismo número leído en la unidad vieja (fracción → %).
  const quisoDecir = fraccionAPorcentaje(f * 100);
  return `¿Seguro? ${escrito} % es muy bajo. Si quisiste ${quisoDecir.replace('.', ',')} %, escribe ${quisoDecir}.`;
}
