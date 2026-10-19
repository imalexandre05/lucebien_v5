// Las frases con las que la pantalla explica por qué no se pudo cerrar un pago, y qué hacer.
// Puro y sin servidor: lo usan las pantallas de cierre (pestaña Pago y «Liquidaciones de todos»).

/** Convierte el error de una acción de cierre en una frase que dice qué hacer. */
export function fraseDeError(r: { error?: string; codigo?: string }): string {
  const base = (r.error ?? 'No se pudo completar.').trim();
  if (r.codigo === 'DATO') {
    return `Falta resolver la asistencia de esos días: resuélvela en la pestaña Asistencia y vuelve a confirmar. ${base}`;
  }
  if (r.codigo === 'DESACTUALIZADA') {
    return 'Se cargó o se corrigió algo mientras se calculaba. Vuelve a ver el cálculo y confirma de nuevo.';
  }
  return base;
}
