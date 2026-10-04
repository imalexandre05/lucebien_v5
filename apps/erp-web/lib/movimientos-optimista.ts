// Piezas puras de la actualización optimista de `/sueldos/movimientos` (spec
// 2026-10-03-adelantos-rendimiento-design.md). Viven acá, fuera del componente, para poder
// probarlas sin navegador: lo que importa es que un fallo NUNCA deje la pantalla mintiendo.

export type ResultadoAccion = { ok: boolean; error?: string; codigo?: string; id?: string };

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
      error: `${mensaje} Se cortó la comunicación con el servidor. Recargue la página y revise la lista antes de volver a intentarlo.`,
    };
  }
}

type FormMovimiento = { monto: string; cantidad: string; motivo: string };

/**
 * Tras un alta rechazada, devuelve lo tipeado al formulario SÓLO si la persona no empezó a cargar
 * otra cosa mientras tanto (el formulario se limpia al registrar). Si ya está escribiendo el
 * siguiente, no se le pisa: el error queda a la vista y la fila provisoria se quita.
 */
export function restaurarSiVacio<F extends FormMovimiento>(actual: F, tipeado: F): F {
  const vacio = actual.monto === '' && actual.motivo === '' && actual.cantidad === '1';
  return vacio ? tipeado : actual;
}

/** Copia del conjunto sin `id` (para devolver a la vista una fila cuyo borrado falló). */
export function sinId(conjunto: Set<string>, id: string): Set<string> {
  if (!conjunto.has(id)) return conjunto;
  const n = new Set(conjunto);
  n.delete(id);
  return n;
}
