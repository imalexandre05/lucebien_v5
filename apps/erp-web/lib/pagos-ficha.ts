import { pagosProgramados, type PagoProgramado } from '@scilb/core';
import {
  cambiosParaCore,
  LiquidacionPagosNoMigradoError,
  listarAcuerdos,
  listarLiquidaciones,
  listarPagosDeLiquidaciones,
} from './sueldos-repo';

// Los pagos programados de una persona, listos para la ficha (decisión del dueño n.º 6): los del
// contrato vigente y, si lo hubo, los del anterior. Todo se calcula en el servidor; a la pantalla
// sólo llegan datos planos. Quien llama decide si quien mira puede ver sueldos.

export type PagoFicha = PagoProgramado & { acuerdoId: string };

export type PagosDeLaPersona = {
  pagos: PagoFicha[];
  /** El contrato al que se le ofrece cerrar un rango suelto: el vigente, o el más reciente. */
  acuerdoId: string | null;
};

export async function pagosDeLaPersona(empleadoId: string): Promise<PagosDeLaPersona> {
  const todos = (await listarAcuerdos(empleadoId)).filter((a) => a.estado !== 'borrador');
  if (todos.length === 0) return { pagos: [], acuerdoId: null };

  // Del más reciente al más viejo (así los devuelve el repo). El vigente es el primero activo.
  const vigente = todos.find((a) => a.estado === 'vigente') ?? todos[0];
  const anterior = todos.find((a) => a.id !== vigente.id && a.fechaInicio < vigente.fechaInicio);
  const contratos = anterior ? [anterior, vigente] : [vigente];

  const liquidaciones = await listarLiquidaciones({ empleadoId });
  const cerradas = liquidaciones.filter((l) => l.estado === 'cerrada');
  const pagadoPor = new Map<string, number>();
  try {
    for (const p of await listarPagosDeLiquidaciones(cerradas.map((l) => l.id))) {
      pagadoPor.set(p.liquidacionId, (pagadoPor.get(p.liquidacionId) ?? 0) + p.monto);
    }
  } catch (e) {
    // Sin la tabla de abonos no se sabe lo pagado: todo cerrado se ve «Cerrado», nunca «Pagado».
    if (!(e instanceof LiquidacionPagosNoMigradoError)) throw e;
  }

  const pagos: PagoFicha[] = [];
  for (const a of contratos) {
    const suyas = liquidaciones
      .filter((l) => l.acuerdoId === a.id)
      .map((l) => ({
        id: l.id,
        desde: l.periodoDesde,
        hasta: l.periodoHasta,
        estado: l.estado,
        total: l.total,
        pagado: pagadoPor.get(l.id) ?? 0,
      }));
    const contrato = {
      fechaInicio: a.fechaInicio,
      fechaFin: a.fechaFin,
      modalidad: a.modalidad,
      cadaDias: a.cadaDias,
      sueldoPactado: a.sueldoPactado,
      tarifaHora: a.tarifaHora,
    };
    const horario = a.turnos.map((t) => ({ diaSemana: t.diaSemana, horaInicio: t.horaInicio, horaFin: t.horaFin }));
    for (const p of pagosProgramados(contrato, cambiosParaCore(a.cambios), suyas, horario)) {
      pagos.push({ ...p, acuerdoId: a.id });
    }
  }
  return { pagos, acuerdoId: vigente.id };
}
