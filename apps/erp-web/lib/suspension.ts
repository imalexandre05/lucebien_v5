// Orden de las operaciones al suspender o reactivar (spec empleados/2026-10-18-suspension-cierra-
// contrato-design.md §2.1). Va aparte de empleados-repo.ts para poder probarlo con dependencias
// inyectadas, sin simular ningún cliente de la base: quien invoca (empleados-repo) aporta las
// llamadas reales.

export type ErrorOp = { message: string } | null;

export type DepsSuspender = {
  bloquearAcceso: () => Promise<ErrorOp>;
  devolverAcceso: () => Promise<ErrorOp>;
  suspenderEnBase: () => Promise<ErrorOp>;
};

/**
 * Primero se cierra la puerta de calle y después se llama a la RPC (ficha + contrato en una
 * transacción). Si la RPC falla se devuelve el acceso y no cambia nada; el orden inverso dejaba el
 * contrato cerrado y el acceso vivo si el baneo fallaba.
 */
export async function suspenderConAcceso(d: DepsSuspender): Promise<void> {
  const eBan = await d.bloquearAcceso();
  if (eBan) throw new Error(`No se pudo suspender el acceso de esta persona: ${eBan.message}. No se cambió nada.`);
  const error = await d.suspenderEnBase();
  if (!error) return;
  // Los mensajes de la RPC llevan un prefijo de código («ESTADO:», «DATO:»…) para la capa de
  // sueldos; a la pantalla sólo le sirve el texto.
  const texto = error.message.replace(/^[A-Z_]+:/, '');
  const eDesban = await d.devolverAcceso();
  if (eDesban) {
    throw new Error(`${texto} Además, no se pudo devolver el acceso a esta persona (${eDesban.message}): reactívala desde su ficha.`);
  }
  throw new Error(texto);
}

export type DepsReactivar = {
  reactivarEnBase: () => Promise<ErrorOp>;
  devolverAcceso: () => Promise<ErrorOp>;
  deshacerReactivacion: () => Promise<void>;
};

/** Reactivar NO reabre el contrato: quien vuelve necesita uno nuevo. */
export async function reactivarConAcceso(d: DepsReactivar): Promise<void> {
  const error = await d.reactivarEnBase();
  if (error) throw new Error(error.message);
  // Si el desbaneo falla se deshace lo anterior: una ficha «activo» con el acceso cerrado es peor
  // que no haber hecho nada.
  const eBan = await d.devolverAcceso();
  if (eBan) {
    await d.deshacerReactivacion();
    throw new Error(`No se pudo reactivar el acceso de esta persona: ${eBan.message}. No se cambió nada.`);
  }
}
