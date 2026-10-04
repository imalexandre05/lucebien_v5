// Piezas puras de la actualización optimista de `/sueldos/movimientos` (spec
// 2026-10-03-adelantos-rendimiento-design.md). Viven acá, fuera del componente, para poder
// probarlas sin navegador: lo que importa es que un fallo NUNCA deje la pantalla mintiendo.

export type ResultadoAccion = {
  ok: boolean;
  error?: string;
  codigo?: string;
  id?: string;
  /**
   * `true` sólo cuando la promesa de la acción RECHAZÓ (red, timeout, 5xx, deploy). Entonces no se
   * sabe si la base escribió: el insert pudo hacerse y perderse sólo la respuesta.
   */
  transporte?: boolean;
};

/**
 * Corre una Server Action y convierte un rechazo de transporte (red caída, timeout, 5xx, un deploy
 * que invalidó el id de la acción) en un resultado de error común.
 *
 * Sin esto, la promesa rechaza y el rollback optimista no corre: un borrado fallido haría
 * desaparecer de la pantalla un adelanto que sigue en la base —y se descontaría en la próxima
 * liquidación—, y un alta fallida quedaría «guardando…» para siempre con lo tipeado perdido.
 */
export async function correrAccion<R extends ResultadoAccion>(
  fn: () => Promise<R>,
  mensaje: string,
): Promise<R | ResultadoAccion> {
  try {
    return await fn();
  } catch {
    // No se sabe si la base llegó a escribir (un timeout puede caer DESPUÉS del insert). Por eso
    // no se dice «no se guardó»: se pide recargar y mirar antes de reintentar, porque reintentar a
    // ciegas un adelanto que sí se guardó lo duplica y se descontaría dos veces.
    return {
      ok: false,
      transporte: true,
      error: `${mensaje} Se cortó la comunicación con el servidor: revise la lista antes de volver a registrar.`,
    };
  }
}

/**
 * Qué hacer después de un fallo, según se sepa o no si la base escribió.
 *
 * - `ok:false` del servidor: la acción corrió y dijo que no (validación, RLS, `CONGELADA`). Se sabe
 *   que no se escribió, así que se puede devolver lo tipeado al formulario.
 * - Fallo de transporte: NO se sabe. Devolver lo tipeado invitaría a un segundo clic en «Registrar»
 *   que crearía un segundo adelanto, descontado dos veces. Entonces no se restaura nada y se pide
 *   al servidor la lista real (`router.refresh()`): si el adelanto se guardó, aparece.
 */
export function planTrasFallo(r: ResultadoAccion): { restaurarFormulario: boolean; refrescar: boolean } {
  return r.transporte ? { restaurarFormulario: false, refrescar: true } : { restaurarFormulario: true, refrescar: false };
}

type FormMovimiento = { empleadoId: string; fecha: string; tipo: string; monto: string; cantidad: string; motivo: string };

/**
 * Tras un alta rechazada por el servidor, devuelve lo tipeado al formulario SÓLO si la persona no
 * tocó nada desde que registró: el formulario se limpió (monto, cantidad, motivo) y la persona, la
 * fecha y el tipo siguen siendo los de lo tipeado. Si ya eligió otra persona o empezó el siguiente,
 * no se le pisa: el error queda a la vista y la fila provisoria se quita.
 */
export function restaurarSiVacio<F extends FormMovimiento>(actual: F, tipeado: F): F {
  const intacto =
    actual.monto === '' &&
    actual.motivo === '' &&
    actual.cantidad === '1' &&
    actual.empleadoId === tipeado.empleadoId &&
    actual.fecha === tipeado.fecha &&
    actual.tipo === tipeado.tipo;
  return intacto ? tipeado : actual;
}

/** Copia del conjunto sin `id` (para devolver a la vista una fila cuyo borrado falló). */
export function sinId(conjunto: Set<string>, id: string): Set<string> {
  if (!conjunto.has(id)) return conjunto;
  const n = new Set(conjunto);
  n.delete(id);
  return n;
}
