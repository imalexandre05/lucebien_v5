'use server';

import { revalidatePath } from 'next/cache';
import type { PesosEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { crearEvaluacion, componentesEvaluacion } from '../../lib/evaluaciones-repo';
import { crearPago, PagosCicloNoMigradoError } from '../../lib/pagos-repo';

async function esAdmin() {
  const s = await getSesion();
  return s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
}

// Calcula los componentes desde la data para el rango [desde, hasta] → operaciones/software/
// limpieza/tardanza/descuento/valores (Fase 12: ahora también valores, RPC 0057). El rango ya NO
// se deriva de un "mes" de calendario a mano — lo manda el cliente, calculado con calcularCiclo()
// (ciclo por aniversario, tarea 3). Competencias/exámenes/bonusVentas siguen siendo manuales.
export async function accionComponentesEval(
  empleadoId: string,
  desde: string,
  hasta: string,
): Promise<{ ok: boolean; comp?: Record<string, number>; error?: string }> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!empleadoId) return { ok: false, error: 'Elige un empleado' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return { ok: false, error: 'Rango de fechas del ciclo inválido' };
    }
    const comp = await componentesEvaluacion(empleadoId, desde, hasta);
    return { ok: true, comp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al calcular' };
  }
}

// Devuelve el id de la evaluación creada (Fase 12): la herramienta única de ciclo lo necesita
// para enlazar el pago que se registra justo después, en la misma pantalla.
export async function accionCrearEvaluacion(input: {
  empleadoId: string;
  mes: string;
  notaFinal: number;
  componentes: Record<string, number>;
  pesos: PesosEval;
  cicloDesde: string | null;
  cicloHasta: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const sesion = await getSesion();
    const puedeAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
    if (!puedeAdmin) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId) return { ok: false, error: 'Elige un empleado' };
    const id = await crearEvaluacion({
      empleadoId: input.empleadoId,
      mes: input.mes,
      notaFinal: input.notaFinal,
      componentes: input.componentes,
      pesos: input.pesos,
      cicloDesde: input.cicloDesde,
      cicloHasta: input.cicloHasta,
    });
    revalidatePath('/evaluaciones');
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al guardar' };
  }
}

// Fase 12 tarea 6: cierra el ciclo evaluación → pago sin salir de /evaluaciones. Si la migración
// 0057 no corrió todavía (columnas de ciclo en `pagos`), crearPago() lanza PagosCicloNoMigradoError
// — se traduce a un mensaje claro en vez de un 500 (lección de la Fase 4/7).
export async function accionRegistrarPagoCiclo(input: {
  empleadoId: string;
  evaluacionId: string;
  cicloDesde: string;
  cicloHasta: string;
  montoBase: number;
  monto: number;
  bonus: number;
  descuentos: number;
  metodo: string;
  fechaPago: string;
  observaciones: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId || !input.evaluacionId) return { ok: false, error: 'Falta la evaluación del ciclo' };
    if (input.monto < 0) return { ok: false, error: 'Monto inválido' };
    const id = await crearPago({
      empleadoId: input.empleadoId,
      monto: input.monto,
      bonus: input.bonus,
      descuentos: input.descuentos,
      metodo: input.metodo,
      estado: 'pagado',
      fechaPago: input.fechaPago,
      evaluacionId: input.evaluacionId,
      montoBase: input.montoBase,
      cicloDesde: input.cicloDesde,
      cicloHasta: input.cicloHasta,
      observaciones: input.observaciones || null,
    });
    revalidatePath('/evaluaciones');
    revalidatePath('/pagos');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof PagosCicloNoMigradoError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar el pago' };
  }
}
