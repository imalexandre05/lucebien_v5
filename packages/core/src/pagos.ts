// pagos.ts — Fase 12 tarea 5: sugerencia de pago, la pieza que cierra el ciclo evaluación → pago
// y hoy faltaba (packages/core/src/evaluaciones.ts calcula la nota, pero nada traducía esa nota a
// un monto sugerido). Puerto literal de routes/pagos.js:107-139 (endpoint GET /sugerir):
//   monto = salario_base × (nota_final / 20) + bonus − descuentos
// Sin evaluación cerrada del periodo (notaFinal null), el sistema viejo devolvía el salario base
// tal cual, sin aplicar bonus/descuentos (routes/pagos.js:134, rama `if (notaFinal != null)`).
//
// El clamp ≥ 0 del original solo aplicaba dentro de esa rama (routes/pagos.js:137); aquí se aplica
// también al salario base "tal cual" por seguridad (nunca sugerir un monto negativo) — es la única
// desviación del puerto literal, y es inocua: un salario_base negativo no debería existir en datos
// reales de todos modos.
export function sugerirMontoPago(
  salarioBase: number,
  notaFinal: number | null | undefined,
  bonus = 0,
  descuentos = 0,
): number {
  const base = Math.max(0, salarioBase || 0);
  if (notaFinal == null) return Math.round(base * 100) / 100;
  // Techo del factor de nota (spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-
  // moneda-design.md §3). Desde que la nota puede salir de puntos (notaDesdePuntos, en
  // ./evaluaciones) ya no tiene techo en 20: alguien "sobresaliente" puede sacar 22,40. La nota
  // sirve para LEER el desempeño, no para multiplicar el sueldo sola — un aumento automático por
  // pasar de 20 es una decisión del administrador ("se evalúa poder mejorar sus condiciones
  // laborales o línea de carrera"), no una fórmula. El factor se limita a 1,00; el piso en 0 de
  // abajo no cambia. Con la nota vieja (tope 20 de hecho) este cambio no altera ningún monto ya
  // sugerido: el factor nunca pasaba de 1 de todos modos.
  const factor = Math.min(notaFinal / 20, 1);
  const monto = base * factor + (bonus || 0) - (descuentos || 0);
  return Math.round(Math.max(0, monto) * 100) / 100;
}
