// Compras y stock de materiales (S16) — cálculos puros del oficio, sin IO.
// El promedio ponderado replica exactamente lo que hace el RPC compra_recibir (0039), de modo
// que la UI pueda previsualizar el costo resultante sin ir a la BD y quede testeado en un solo lugar.

export type EstadoCompra = 'pendiente' | 'recibida' | 'anulada';
export const ESTADOS_COMPRA: EstadoCompra[] = ['pendiente', 'recibida', 'anulada'];

export type TipoMovimientoStock = 'entrada' | 'salida' | 'ajuste';
export const TIPOS_MOVIMIENTO: TipoMovimientoStock[] = ['entrada', 'salida', 'ajuste'];

export type ItemCompra = { cantidad: number; costoUnitario: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// Total de una compra = Σ(cantidad × costo_unitario).
export function totalCompra(items: ItemCompra[]): number {
  return r2(items.reduce((s, it) => s + it.cantidad * it.costoUnitario, 0));
}

// Valida los ítems de una compra. Devuelve la lista de errores (vacía = válida).
export function validarCompra(items: ItemCompra[]): string[] {
  const errores: string[] = [];
  if (items.length === 0) errores.push('La compra no tiene ítems.');
  items.forEach((it, i) => {
    if (!(it.cantidad > 0)) errores.push(`Ítem ${i + 1}: la cantidad debe ser mayor que 0.`);
    if (it.costoUnitario < 0) errores.push(`Ítem ${i + 1}: el costo no puede ser negativo.`);
  });
  return errores;
}

// Nuevo costo promedio ponderado tras recibir `cantidad` a `costoUnitario`.
// (stockActual·costoActual + cantidad·costoUnitario) / (stockActual + cantidad).
export function costoPromedioPonderado(
  stockActual: number,
  costoActual: number,
  cantidad: number,
  costoUnitario: number,
): number {
  const nuevoStock = stockActual + cantidad;
  if (nuevoStock <= 0) return r4(costoActual);
  return r4((stockActual * costoActual + cantidad * costoUnitario) / nuevoStock);
}

// ¿El material está por debajo de su mínimo? (solo cuenta si está activo).
export function stockBajo(m: { stockActual: number; stockMinimo: number; activo?: boolean }): boolean {
  if (m.activo === false) return false;
  return m.stockMinimo > 0 && m.stockActual < m.stockMinimo;
}

// Stock resultante de aplicar un movimiento manual (entrada suma, salida resta, ajuste fija).
export function aplicarMovimiento(stockActual: number, tipo: TipoMovimientoStock, cantidad: number): number {
  if (tipo === 'entrada') return r2(stockActual + cantidad);
  if (tipo === 'salida') return r2(stockActual - cantidad);
  return r2(cantidad);
}
