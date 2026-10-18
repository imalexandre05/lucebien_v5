import { validarCadaDias } from '@scilb/core';
import type { ModalidadAcuerdo } from './sueldos-repo';
import type { ParametrosSueldo } from '@scilb/core';

// Forma que valida el formulario de contrato (la misma que recibe la acción del servidor).
export type AcuerdoForm = {
  empleadoId: string;
  fechaInicio: string;
  fechaFin: string;
  modalidad: ModalidadAcuerdo;
  cadaDias: number | null;
  sueldoPactado: number;
  escala: number | null;
  almuerzoHabilitado: boolean;
  parametros: Partial<ParametrosSueldo>;
  turnos: { diaSemana: number; horaInicio: string; horaFin: string; lugar: string | null }[];
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Una fecha 'YYYY-MM-DD' que existe en el calendario (2026-02-30 no). Aritmética sobre Date.UTC
// con valores recibidos: no lee el reloj.
function fechaReal(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * Lo que se comprueba antes de tocar la base. No reemplaza a los `check` de la 0072: los duplica
 * a propósito, porque un mensaje de constraint no le dice nada a quien está cargando un contrato.
 *
 * Lo que NO se comprueba acá es el solape de turnos: eso lo hace la restricción de exclusión de
 * la 0072 y también `resumirHorario()` del core, con un mensaje mejor que el que escribiríamos.
 */
export function validarAcuerdo(f: AcuerdoForm): string | null {
  if (!f.empleadoId) return 'Elige a la persona del contrato.';
  if (!fechaReal(f.fechaInicio)) return 'La fecha de inicio no es una fecha válida (usa año-mes-día).';
  if (!fechaReal(f.fechaFin)) return 'La fecha de fin no es una fecha válida (usa año-mes-día).';
  if (f.fechaFin < f.fechaInicio) return 'La fecha de fin no puede ser anterior a la de inicio.';
  if (f.modalidad === 'dias') {
    try {
      validarCadaDias(f.cadaDias);
    } catch (e) {
      return e instanceof Error ? e.message : 'Cada cuántos días se paga tiene que estar entre 1 y 62.';
    }
  }
  if (!Number.isFinite(f.sueldoPactado) || f.sueldoPactado <= 0) {
    return 'El sueldo pactado tiene que ser mayor que cero.';
  }
  if (f.escala != null && (!Number.isInteger(f.escala) || f.escala < 1)) {
    return 'La escala tiene que ser un número entero de 1 en adelante.';
  }
  // La comisión pactada es una FRACCIÓN de la base, no un porcentaje: el motor la multiplica tal
  // cual (RN-13). La pantalla la convierte antes de enviarla (lib/porcentaje.ts); esto la vuelve a
  // comprobar porque una Server Action es un endpoint público. El mensaje habla en porcentaje
  // porque es la unidad que la persona ve.
  const pctComision = f.parametros?.pctComision;
  if (pctComision != null && (!Number.isFinite(pctComision) || pctComision < 0 || pctComision > 1)) {
    return 'La comisión tiene que estar entre 0 % y 100 %.';
  }
  for (const t of f.turnos) {
    if (!Number.isInteger(t.diaSemana) || t.diaSemana < 1 || t.diaSemana > 7) {
      return `El día de la semana de un turno tiene que ir de 1 (lunes) a 7 (domingo); llegó ${t.diaSemana}.`;
    }
    if (!t.horaInicio || !t.horaFin) return 'Hay un turno sin hora de inicio o de fin.';
    if (!HORA.test(t.horaInicio) || !HORA.test(t.horaFin)) {
      return `La hora del turno del día ${t.diaSemana} no es válida: usa el formato HH:MM, por ejemplo 09:00.`;
    }
    if (t.horaFin <= t.horaInicio) {
      return `Turno inválido el día ${t.diaSemana}: ${t.horaInicio}–${t.horaFin}. La salida tiene que ser posterior a la entrada.`;
    }
  }
  return null;
}
