// Resumen de liquidación en el formato de la hoja RESUMEN del Excel.
// Spec: docs/superpowers/specs/2026-10-17-resumen-liquidacion-design.md.
//
// Función pura: NO recalcula el motor. Reagrupa las líneas que `liquidarPeriodo()` ya emitió (y que
// se congelaron al cerrar) en las filas que el equipo está acostumbrado a leer. Lo que el sistema
// no tiene (mínimo de ventas para continuar) queda en `null` y la pantalla lo muestra
// como «No configurado»: no se inventa ninguna regla.

import type { GrupoLinea } from './sueldos';

export interface LineaParaResumen {
  grupo: GrupoLinea;
  concepto: string;
  monto: number;
}

export interface EntradaResumen {
  lineas: LineaParaResumen[];
  ventas: { total: number; metaPeriodo: number };
  /** Total congelado de la liquidación (ya con los adelantos descontados). */
  total: number;
  /** Suma de abonos NO anulados. */
  abonos: number;
  /** Aún no existe en el sistema; si algún día se configura, entra por acá. */
  minimoVentas?: number | null;
  /**
   * Soles de los almuerzos que la empresa entregó en especie: (días con derecho − almuerzos a pagar) × valor
   * del almuerzo de esa liquidación. Ausente = 0. Los pagados en soles ya están dentro del total final.
   */
  almuerzosEmpresa?: number;
}

export interface ResumenLiquidacion {
  ventasAcordado: number;
  minimoVentas: number | null;
  ventasLogrado: number;
  /** `null` mientras no haya mínimo configurado. */
  continua: boolean | null;
  horasExtras: number;
  comision1: number;
  /** 2.ª comisión = bono por metas semanales cumplidas (RN-12). */
  comision2: number;
  capacitacion: number;
  /** Pasajes por llegar temprano. */
  pasajes: number;
  /** Puntos, bonos extras, almuerzos y toda línea positiva no reconocida. */
  otrosBeneficios: number;
  penalidadTardanzas: number;
  penalidadFaltas: number;
  penalidadReportes: number;
  otrosDescuentos: number;
  sueldo: number;
  totalBeneficios: number;
  totalDescuentos: number;
  totalFinalPorPagar: number;
  adelantos: number;
  abonos: number;
  restante: number;
  cancelado: boolean;
  almuerzos: number;
  totalInvertido: number;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function resumenLiquidacion(e: EntradaResumen): ResumenLiquidacion {
  let sueldo = 0;
  let comision1 = 0;
  let comision2 = 0;
  let capacitacion = 0;
  let pasajes = 0;
  let horasExtras = 0;
  let tardanzas = 0;
  let faltas = 0;
  let reportes = 0;
  let adelantos = 0;
  let almuerzos = 0;
  let otrosBeneficios = 0;
  let otrosDescuentos = 0;

  for (const l of e.lineas) {
    const c = l.concepto;
    // Pago por horas (spec sueldos/2026-10-18-sueldo-por-horas §5): «Horas trabajadas» es el sueldo,
    // «Horas extra» son las horas extras y «Horas que faltaron» (monto 0) sólo informa.
    if (c === 'Sueldo' || c === 'Horas trabajadas') sueldo += l.monto;
    else if (c === 'Horas extra') horasExtras += l.monto;
    else if (c === 'Horas que faltaron') continue;
    else if (c.startsWith('Comisión')) comision1 += l.monto;
    else if (c === 'Bono por metas semanales') comision2 += l.monto;
    else if (c === 'Pasajes por llegar temprano') pasajes += l.monto;
    else if (c === 'Apoyo en capacitación') capacitacion += l.monto;
    else if (c === 'Diferencia de horas' || c === 'Horas fuera de contrato') horasExtras += l.monto;
    else if (c === 'Descuento por tardanzas') tardanzas -= l.monto;
    else if (c === 'Faltas injustificadas') faltas -= l.monto;
    else if (c === 'Reportes con descuento') reportes -= l.monto;
    else if (c === 'Adelantos') adelantos -= l.monto;
    else if (c === 'Almuerzos') {
      almuerzos += l.monto;
      otrosBeneficios += l.monto;
    } else if (l.monto >= 0) otrosBeneficios += l.monto;
    else otrosDescuentos -= l.monto;
  }

  sueldo = r2(sueldo);
  comision1 = r2(comision1);
  comision2 = r2(comision2);
  capacitacion = r2(capacitacion);
  pasajes = r2(pasajes);
  horasExtras = r2(horasExtras);
  otrosBeneficios = r2(otrosBeneficios);
  otrosDescuentos = r2(otrosDescuentos);
  adelantos = r2(adelantos);
  almuerzos = r2(almuerzos);
  const penalidadTardanzas = r2(tardanzas);
  const penalidadFaltas = r2(faltas);
  const penalidadReportes = r2(reportes);

  const minimo = e.minimoVentas ?? null;
  const ventasLogrado = r2(e.ventas.total);
  const total = r2(e.total);
  const abonos = r2(e.abonos);
  const pagable = total > 0;
  const restante = pagable ? r2(Math.max(0, total - abonos)) : 0;

  return {
    ventasAcordado: r2(e.ventas.metaPeriodo),
    minimoVentas: minimo,
    ventasLogrado,
    continua: minimo == null ? null : ventasLogrado > minimo,
    horasExtras,
    comision1,
    comision2,
    capacitacion,
    pasajes,
    otrosBeneficios,
    penalidadTardanzas,
    penalidadFaltas,
    penalidadReportes,
    otrosDescuentos,
    sueldo,
    totalBeneficios: r2(comision1 + comision2 + capacitacion + pasajes + otrosBeneficios),
    totalDescuentos: r2(penalidadTardanzas + penalidadFaltas + penalidadReportes + otrosDescuentos),
    totalFinalPorPagar: r2(total + adelantos),
    adelantos,
    abonos,
    restante,
    cancelado: pagable && restante === 0,
    almuerzos,
    // Total invertido = lo pagado a la persona (total final, que ya incluye los almuerzos pagados en soles)
    // + los almuerzos que puso la empresa en especie. Cada almuerzo entra una sola vez.
    totalInvertido: r2(r2(total + adelantos) + r2(Math.max(0, e.almuerzosEmpresa ?? 0))),
  };
}
