// @ts-nocheck — vitest no es dependencia declarada de erp-web y el typecheck incluye `**/*.ts`.
//
// QUÉ PRUEBA (spec empleados/2026-10-18-suspension-cierra-contrato-design.md §4): lo que el
// formulario de contrato deja pasar hasta hoy y que la base rechaza con un error crudo o, peor,
// rompe en pantalla: fechas que no existen, día de la semana fuera de 1..7, hora mal escrita.
import { describe, expect, it } from 'vitest';
import { validarAcuerdo } from '../acuerdo-validar';

const ok = {
  empleadoId: 'e1',
  fechaInicio: '2026-10-01',
  fechaFin: '2026-12-31',
  modalidad: 'mensual',
  cadaDias: null,
  sueldoPactado: 1500,
  escala: null,
  almuerzoHabilitado: false,
  parametros: {},
  turnos: [{ diaSemana: 1, horaInicio: '09:00', horaFin: '13:00', lugar: null }],
};

describe('validarAcuerdo', () => {
  it('acepta un contrato completo', () => {
    expect(validarAcuerdo(ok)).toBeNull();
  });
  it('rechaza una fecha que no existe', () => {
    expect(validarAcuerdo({ ...ok, fechaInicio: '2026-02-30' })).toMatch(/fecha de inicio/i);
    expect(validarAcuerdo({ ...ok, fechaFin: '31/12/2026' })).toMatch(/fecha de fin/i);
  });
  it('rechaza un día de la semana fuera de 1 a 7', () => {
    expect(validarAcuerdo({ ...ok, turnos: [{ ...ok.turnos[0], diaSemana: 0 }] })).toMatch(/día/i);
    expect(validarAcuerdo({ ...ok, turnos: [{ ...ok.turnos[0], diaSemana: 8 }] })).toMatch(/día/i);
    expect(validarAcuerdo({ ...ok, turnos: [{ ...ok.turnos[0], diaSemana: 1.5 }] })).toMatch(/día/i);
  });
  it('rechaza una hora que no es HH:MM', () => {
    expect(validarAcuerdo({ ...ok, turnos: [{ ...ok.turnos[0], horaInicio: '25:00' }] })).toMatch(/hora/i);
    expect(validarAcuerdo({ ...ok, turnos: [{ ...ok.turnos[0], horaFin: '9am' }] })).toMatch(/hora/i);
  });
  it('conserva las reglas de antes y no usa voseo', () => {
    expect(validarAcuerdo({ ...ok, empleadoId: '' })).toBe('Elige a la persona del contrato.');
    expect(validarAcuerdo({ ...ok, fechaFin: '2026-09-01' })).toMatch(/anterior/);
    expect(validarAcuerdo({ ...ok, sueldoPactado: 0 })).toMatch(/mayor que cero/);
  });
});
