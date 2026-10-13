// @ts-nocheck
//
// `@ts-nocheck` por la misma razón que sueldos-repo.corregir.test.ts: vitest no es dependencia de
// erp-web y sus tipos no resuelven desde acá; la ejecución no se ve afectada.
//
// QUÉ PRUEBA. Que cada tipo de notificación que hoy escriben las RPC (generar_alertas() de la 0109
// y reportes_auto_evaluar_vencidos() de la 0064) lleve a la pantalla donde se resuelve, con los
// datos exactos que la RPC pone en ref_tipo/ref_id/dedup_key/mensaje (tablero#5).
import { describe, expect, it } from 'vitest';
import { enlaceNotificacion, periodoHoraEstimada } from '../notificaciones-enlace';

const EMP = '7d1b0c2e-0000-4000-8000-000000000001';
const ACU = '7d1b0c2e-0000-4000-8000-0000000000a1';
const LIQ = '7d1b0c2e-0000-4000-8000-0000000000f1';

function n(p: Partial<Parameters<typeof enlaceNotificacion>[0]>) {
  return { tipo: '', refTipo: null, refId: null, dedupKey: null, mensaje: '', ...p };
}

describe('enlaceNotificacion — reglas de control interno (0109)', () => {
  it('declaracion_incompleta lleva a declarar asistencia del contrato de esa liquidación', () => {
    const x = n({ tipo: 'declaracion_incompleta', refTipo: 'liquidacion', refId: LIQ, contexto: { empleadoId: EMP, acuerdoId: ACU } });
    expect(enlaceNotificacion(x, true)).toBe(`/personal/${EMP}/asistencias?acuerdo=${ACU}`);
  });

  it('declaracion_incompleta sin contexto cae a la pantalla general de declarar asistencia', () => {
    const x = n({ tipo: 'declaracion_incompleta', refTipo: 'liquidacion', refId: LIQ, contexto: null });
    expect(enlaceNotificacion(x, true)).toBe('/sueldos/asistencia');
  });

  it('periodo_liquidable preselecciona el contrato en Liquidaciones', () => {
    const x = n({ tipo: 'periodo_liquidable', refTipo: 'acuerdo', refId: ACU });
    expect(enlaceNotificacion(x, true)).toBe(`/sueldos/liquidaciones?acuerdo=${ACU}`);
  });

  it('dia_con_hora_estimada abre las asistencias de la persona en el período del aviso', () => {
    const x = n({
      tipo: 'dia_con_hora_estimada',
      refTipo: 'empleado',
      refId: EMP,
      dedupKey: `dia_con_hora_estimada:${EMP}:2026-09-01:admin`,
      mensaje: 'Ana: 3 día(s) del período 2026-09-01 a 2026-09-30 tienen la hora puesta por el sistema, no marcada — revisalos en Asistencias.',
    });
    expect(enlaceNotificacion(x, true)).toBe(`/personal/${EMP}/asistencias?desde=2026-09-01&hasta=2026-09-30`);
  });

  it('dia_con_hora_estimada sin el período en el mensaje usa un día (desde del dedup_key)', () => {
    const x = n({ tipo: 'dia_con_hora_estimada', refTipo: 'empleado', refId: EMP, dedupKey: `dia_con_hora_estimada:${EMP}:2026-09-01:admin`, mensaje: 'otro texto' });
    expect(enlaceNotificacion(x, true)).toBe(`/personal/${EMP}/asistencias?desde=2026-09-01&hasta=2026-09-01`);
  });

  it('dia_sin_marca abre las asistencias de la persona', () => {
    const x = n({ tipo: 'dia_sin_marca', refTipo: 'empleado', refId: EMP, dedupKey: `dia_sin_marca:${EMP}:admin` });
    expect(enlaceNotificacion(x, true)).toBe(`/personal/${EMP}/asistencias`);
  });

  it('extra_sin_valor lleva al catálogo de actividades, aunque no haya quien lo registró', () => {
    expect(enlaceNotificacion(n({ tipo: 'extra_sin_valor', refTipo: 'empleado', refId: EMP }), true)).toBe('/configuracion/actividades');
    expect(enlaceNotificacion(n({ tipo: 'extra_sin_valor', refTipo: 'empleado', refId: null }), true)).toBe('/configuracion/actividades');
  });

  it('falta_fecha_ingreso abre los datos de la persona', () => {
    expect(enlaceNotificacion(n({ tipo: 'falta_fecha_ingreso', refTipo: 'empleado', refId: EMP }), true)).toBe(`/personal/${EMP}/datos`);
  });

  it('a quien no es administrador no se le ofrece un enlace a una pantalla con candado', () => {
    for (const tipo of ['declaracion_incompleta', 'periodo_liquidable', 'dia_con_hora_estimada', 'dia_sin_marca', 'extra_sin_valor', 'falta_fecha_ingreso']) {
      const x = n({ tipo, refTipo: 'empleado', refId: EMP, dedupKey: `${tipo}:${EMP}:2026-09-01:persona`, contexto: { empleadoId: EMP, acuerdoId: ACU } });
      expect(enlaceNotificacion(x, false)).toBeNull();
    }
  });
});

describe('enlaceNotificacion — reportes y reglas viejas', () => {
  it('reporte_sin_evaluar y reporte_auto_evaluado abren el reporte, para cualquier rol', () => {
    expect(enlaceNotificacion(n({ tipo: 'reporte_sin_evaluar', refTipo: 'reporte', refId: 'R-1' }), false)).toBe('/reportes/R-1');
    expect(enlaceNotificacion(n({ tipo: 'reporte_auto_evaluado', refTipo: 'reporte', refId: 'R-2' }), true)).toBe('/reportes/R-2');
  });

  it('las reglas comerciales (apagadas en la 0101) conservan su enlace por origen', () => {
    expect(enlaceNotificacion(n({ tipo: 'devolucion_vencida', refTipo: 'pedido', refId: 'P1' }), true)).toBe('/pedidos/P1');
    expect(enlaceNotificacion(n({ tipo: 'stock_bajo', refTipo: 'material', refId: 'M1' }), true)).toBe('/materiales');
    expect(enlaceNotificacion(n({ tipo: 'caja_sin_cerrar', refTipo: 'caja', refId: 'C1' }), true)).toBe('/caja');
  });

  it('un tipo desconocido sin origen conocido no lleva a ningún lado', () => {
    expect(enlaceNotificacion(n({ tipo: 'nuevo', refTipo: 'otro', refId: 'X' }), true)).toBeNull();
  });

  it('escapa el id en la URL', () => {
    expect(enlaceNotificacion(n({ tipo: 'reporte_sin_evaluar', refTipo: 'reporte', refId: 'a/b' }), true)).toBe('/reportes/a%2Fb');
  });
});

describe('periodoHoraEstimada', () => {
  it('ignora un dedup_key de otro tipo o sin fecha', () => {
    expect(periodoHoraEstimada({ dedupKey: `dia_sin_marca:${EMP}:admin`, mensaje: '' })).toBeNull();
    expect(periodoHoraEstimada({ dedupKey: null, mensaje: '' })).toBeNull();
  });

  it('no toma un período del mensaje que no empiece en el desde del dedup_key', () => {
    const p = periodoHoraEstimada({ dedupKey: `dia_con_hora_estimada:${EMP}:2026-09-01:admin`, mensaje: 'del período 2026-08-01 a 2026-08-31' });
    expect(p).toEqual({ desde: '2026-09-01', hasta: '2026-09-01' });
  });
});
