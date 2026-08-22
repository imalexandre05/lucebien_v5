// La lectura semanal de ventas que muestra la pantalla. NO es el motor: el pago sale de
// liquidarPeriodo(). Reutiliza tramosSemanales() y diasDelPeriodo() de sueldos.ts en vez de
// reimplementarlas — son RN-12, no un espejo de RN-12. Lo unico nuevo aca es cruzar esas semanas
// con las ventas y la meta, algo que hoy solo existia enterrado dentro de liquidarPeriodo().
//
// El estricto de cumplida (`>`, no `>=`) copia SPEC-sistema-sueldos.md §9.3: empatar la meta no
// la cumple.

import { diasDelPeriodo, tramosSemanales } from './sueldos';

export type SemanaMeta = {
  numero: number;
  desde: string;
  hasta: string;
  dias: number;
  vendido: number;
  meta: number;
  cumplida: boolean;
};

/** Las semanas del periodo con lo vendido en cada una y si llego a la meta. */
export function semanasConMeta(
  desde: string,
  hasta: string,
  ventas: { fecha: string; monto: number }[],
  metaSemanal: number,
): SemanaMeta[] {
  return tramosSemanales(desde, hasta).map((t, i) => {
    const vendido = ventas
      .filter((v) => v.fecha >= t.desde && v.fecha <= t.hasta)
      .reduce((s, v) => s + v.monto, 0);
    return {
      numero: i + 1,
      desde: t.desde,
      hasta: t.hasta,
      dias: diasDelPeriodo(t.desde, t.hasta).length,
      vendido,
      meta: metaSemanal,
      // Estricto a proposito: empatar la meta no la cumple (SPEC-sistema-sueldos §9.3).
      cumplida: vendido > metaSemanal,
    };
  });
}
