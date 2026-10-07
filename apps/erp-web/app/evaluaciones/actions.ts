'use server';

import { revalidatePath } from 'next/cache';
import { armarEvaluacionAGuardar, type BandaEval, type EntradaManualEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { crearEvaluacion, componentesEvaluacion, leerEscalaPuntos, leerPesosEval, type ComponentesRPC } from '../../lib/evaluaciones-repo';

async function esAdmin() {
  const s = await getSesion();
  return s?.usuario.rol === 'admin' || s?.usuario.rol === 'dueno';
}

// Una evaluación por persona y mes: la unicidad la garantiza la base
// (evaluaciones_mensuales_empleado_id_mes_key). Volver a guardar el mismo ciclo es el error
// humano más probable de esta pantalla, y hasta ahora llegaba como el texto crudo de Postgres.
// Sólo se traduce ese choque: cualquier otro error sigue mostrándose tal cual para no esconder
// un fallo real detrás de un mensaje amable.
function mensajeDeError(e: unknown, porDefecto: string): string {
  if (!(e instanceof Error)) return porDefecto;
  if (e.message.includes('evaluaciones_mensuales_empleado_id_mes_key')) {
    return 'Ya existe una evaluación de esta persona para ese mes';
  }
  return e.message || porDefecto;
}

// Calcula los componentes desde la data para el rango [desde, hasta] → operaciones/software/
// limpieza/tardanza/descuento/valores (Fase 12: ahora también valores, RPC 0057). El rango ya NO
// se deriva de un "mes" de calendario a mano — lo manda el cliente, calculado con calcularCiclo()
// (ciclo por aniversario, tarea 3). Competencias/exámenes/bonusVentas siguen siendo manuales.
export async function accionComponentesEval(
  empleadoId: string,
  desde: string,
  hasta: string,
): Promise<{ ok: boolean; comp?: ComponentesRPC; error?: string }> {
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

// Devuelve el id de la evaluación creada. Ya no enlaza ningún pago desde acá (ver el cierre del
// archivo): el id queda como referencia de lo recién guardado para la pantalla.
//
// La nota, los puntos y los componentes automáticos NO vienen del cliente: se recalculan acá con la
// misma RPC y la misma escala que usa la pantalla, para el empleado y el ciclo exactos que se
// guardan (spec 2026-10-04-evaluacion-guardar-recalculada). Del cliente sólo entra el juicio humano.
export async function accionCrearEvaluacion(input: {
  empleadoId: string;
  cicloDesde: string;
  cicloHasta: string;
  manual: EntradaManualEval;
}): Promise<{ ok: boolean; id?: string; notaFinal?: number; banda?: BandaEval; error?: string }> {
  try {
    if (!(await esAdmin())) return { ok: false, error: 'Solo admin/dueño' };
    if (!input.empleadoId) return { ok: false, error: 'Elige un empleado' };
    const { cicloDesde, cicloHasta } = input;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cicloDesde) || !/^\d{4}-\d{2}-\d{2}$/.test(cicloHasta)) {
      return { ok: false, error: 'Rango de fechas del ciclo inválido' };
    }
    if (cicloDesde > cicloHasta) return { ok: false, error: 'El ciclo empieza después de terminar' };
    const [data, escala, pesos] = await Promise.all([
      componentesEvaluacion(input.empleadoId, cicloDesde, cicloHasta),
      leerEscalaPuntos(),
      leerPesosEval(),
    ]);
    const m = input.manual ?? ({} as EntradaManualEval);
    const r = armarEvaluacionAGuardar(data, escala, {
      competencias: m.competencias,
      examenes: m.examenes,
    });
    const id = await crearEvaluacion({
      empleadoId: input.empleadoId,
      mes: cicloDesde.slice(0, 7),
      notaFinal: r.notaFinal,
      componentes: r.componentes as unknown as Record<string, number>,
      pesos,
      cicloDesde,
      cicloHasta,
      metodo: 'puntos',
      puntosTotal: r.puntosTotal,
    });
    revalidatePath('/evaluaciones');
    return { ok: true, id, notaFinal: r.notaFinal, banda: r.banda };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'Error al guardar') };
  }
}

// Acá vivía accionRegistrarPagoCiclo(), el segundo camino de pago: escribía en `pagos` desde
// /evaluaciones. Se borró el 23-ago-2026 porque la ROTURA 2 ya había cerrado ese camino en la
// pantalla —«la liquidación ES el pago»— y quedó como acción de servidor sin ningún llamador,
// alcanzable igual desde fuera. Esta pantalla ya no escribe dinero: el pago vive en la pestaña
// de la persona.
