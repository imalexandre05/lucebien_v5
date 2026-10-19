'use client';

import { useMemo } from 'react';
import {
  calendarioDePagos,
  finDePeriodo,
  referenciaPorHoras,
  tarifaDelDia,
  type CambioFrecuencia,
  type TurnoContratado,
  type ModalidadPago,
  type PagoCalendario,
} from '@scilb/core';
import { Aviso, Input } from '../../../components/ui/form';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';

// «Cómo se paga» (spec frecuencia-pago-flexible §6): cuatro botones y, debajo, la vista previa de
// los pagos que salen de elegirlos. Lo usan el formulario del contrato y el panel «Cambiar cómo se
// paga». Sin lógica de negocio propia: todo el calendario sale de `calendarioDePagos()` del core.

const OPCIONES: Opcion<ModalidadPago>[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'dias', label: 'Cada __ días' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-09-10' → '10-sep' */
export function fechaCorta(f: string): string {
  const [, m, d] = f.split('-').map(Number);
  return `${d}-${MESES[m - 1]}`;
}

// Mismo formato que el resto de la pantalla de contratos (cliente.tsx).
export const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Nombre corto de una frecuencia: «Quincenal», «Cada 10 días». */
export function nombreFrecuencia(modalidad: string, cadaDias: number | null | undefined): string {
  if (modalidad === 'dias') return `Cada ${cadaDias ?? '?'} días`;
  return modalidad.charAt(0).toUpperCase() + modalidad.slice(1);
}

/**
 * Resume los pagos en una línea: «6 pagos de S/650: 10-sep, 10-oct, 10-nov…» y, si el último es más
 * corto, «Último pago: 5 días · S/108,33».
 */
export function resumenDePagos(pagos: PagoCalendario[]): { linea: string; ultimoCorto: string | null } {
  if (pagos.length === 0) return { linea: '', ultimoCorto: null };
  const ultimo = pagos[pagos.length - 1];
  const completos = ultimo.corto ? pagos.slice(0, -1) : pagos;
  const cuotas = new Set(completos.map((p) => `${p.cuota}|${p.modalidad}|${p.cadaDias}`));
  const fechas = completos.slice(0, 3).map((p) => fechaCorta(p.desde)).join(', ');
  const mas = completos.length > 3 ? '…' : '';
  const base =
    cuotas.size <= 1 && completos.length > 0
      ? `${completos.length} ${completos.length === 1 ? 'pago' : 'pagos'} de ${soles(completos[0].cuota)}: ${fechas}${mas}`
      : `${completos.length} pagos: ${fechas}${mas}`;
  const corto = ultimo.corto
    ? `Último pago: ${ultimo.dias} ${ultimo.dias === 1 ? 'día' : 'días'} · ${soles(ultimo.cuota)}`
    : null;
  return { linea: base, ultimoCorto: corto };
}

/**
 * Contrato por horas (spec sueldo-por-horas §6): no hay cuota por pago; cada pago paga las horas
 * que se trabajen. Se muestra cuántos pagos son y, sólo como orientación, lo que cobraría cada uno
 * si cumple su horario (`referenciaPorHoras` del core, sobre las fechas de ese pago).
 */
export function resumenDePagosPorHoras(
  pagos: PagoCalendario[],
  referenciaDe: ((p: PagoCalendario) => number) | null,
): string {
  if (pagos.length === 0) return '';
  const n = pagos.length;
  const base = `${n} ${n === 1 ? 'pago' : 'pagos'} · cada uno paga sus horas`;
  if (!referenciaDe) return base;
  const refs = pagos.map(referenciaDe);
  const min = Math.min(...refs);
  const max = Math.max(...refs);
  if (!(max > 0)) return base;
  const rango = min === max ? soles(max) : `entre ${soles(min)} y ${soles(max)}`;
  return `${base} (≈ ${rango} si cumple su horario)`;
}

export function ComoSePaga({
  modalidad,
  cadaDias,
  onChange,
  fechaInicio,
  fechaFin,
  cuota,
  cambios,
  disabled,
  porHoras,
}: {
  modalidad: ModalidadPago;
  cadaDias: string;
  onChange: (modalidad: ModalidadPago, cadaDias: string) => void;
  fechaInicio: string;
  fechaFin: string;
  cuota: number;
  cambios?: CambioFrecuencia[];
  disabled?: boolean;
  /** Contrato por horas: la vista previa habla de horas, no de cuota. `tarifa` 0 = aún sin completar. */
  porHoras?: { turnos: TurnoContratado[]; tarifa: number };
}) {
  const calendario = useMemo(() => {
    // Por horas no hay cuota: el calendario sólo necesita las fechas (la cuota 1 no se muestra).
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio || !(porHoras || cuota > 0)) return null;
    try {
      const n = Number(cadaDias);
      return calendarioDePagos(
        { fechaInicio, fechaFin, modalidad, cadaDias: modalidad === 'dias' ? n : null, sueldoPactado: porHoras ? 1 : cuota },
        cambios ?? [],
      );
    } catch {
      return null; // «Cada __ días» sin un N válido todavía: no hay vista previa que mostrar.
    }
  }, [modalidad, cadaDias, fechaInicio, fechaFin, cuota, cambios, porHoras]);

  const resumen = calendario && !porHoras ? resumenDePagos(calendario) : null;

  const lineaPorHoras = useMemo(() => {
    if (!calendario || !porHoras) return null;
    let referenciaDe: ((p: PagoCalendario) => number) | null = null;
    if (porHoras.tarifa > 0 && porHoras.turnos.length > 0) {
      try {
        const contrato = {
          fechaInicio,
          fechaFin,
          modalidad,
          cadaDias: modalidad === 'dias' ? Number(cadaDias) : null,
          sueldoPactado: 0,
          tarifaHora: porHoras.tarifa,
        };
        const lista = cambios ?? [];
        // Prueba una vez: si el horario es inválido (turnos solapados) no hay referencia que dar.
        referenciaPorHoras(porHoras.turnos, fechaInicio, fechaInicio, porHoras.tarifa);
        referenciaDe = (p) =>
          referenciaPorHoras(porHoras.turnos, p.desde, p.hasta, tarifaDelDia(contrato, lista, p.desde));
      } catch {
        referenciaDe = null;
      }
    }
    return resumenDePagosPorHoras(calendario, referenciaDe);
  }, [calendario, porHoras, fechaInicio, fechaFin, modalidad, cadaDias, cambios]);

  // Si el último pago queda corto, se sugiere terminar donde cierra ese período (spec §3.3: «el día
  // anterior al aniversario»). Sólo sugiere: el administrador decide.
  const sugerenciaFin = useMemo(() => {
    if (!calendario || calendario.length === 0) return null;
    const ultimo = calendario[calendario.length - 1];
    if (!ultimo.corto) return null;
    try {
      const completo = finDePeriodo(
        ultimo.desde,
        { modalidad: ultimo.modalidad, cadaDias: ultimo.cadaDias },
        undefined,
        (cambios ?? []).filter((c) => c.desde <= ultimo.desde).map((c) => c.desde).sort().pop() ?? fechaInicio,
      );
      return completo > ultimo.hasta ? completo : null;
    } catch {
      return null;
    }
  }, [calendario, cambios, fechaInicio]);

  return (
    <div className="space-y-2">
      <OpcionBotones
        opciones={OPCIONES}
        value={modalidad}
        onChange={(x) => onChange(x as ModalidadPago, x === 'dias' ? cadaDias || '10' : '')}
        ariaLabel="Cómo se paga"
        disabled={disabled}
      />
      {modalidad === 'dias' && (
        <div className="flex items-center gap-2 text-cuerpo text-navy">
          Cada
          <Input
            type="number"
            min={1}
            max={62}
            step={1}
            value={cadaDias}
            onChange={(e) => onChange('dias', e.target.value)}
            className="w-24 tabular-nums"
            aria-label="Cada cuántos días se paga"
            disabled={disabled}
          />
          días <span className="text-apoyo text-muted">(entre 1 y 62)</span>
        </div>
      )}
      {resumen && resumen.linea && (
        <p className="text-apoyo text-muted tabular-nums">
          {resumen.linea}
          {resumen.ultimoCorto && <span className="block text-navy">{resumen.ultimoCorto}</span>}
        </p>
      )}
      {lineaPorHoras && <p className="text-apoyo text-muted tabular-nums">{lineaPorHoras}</p>}
      {sugerenciaFin && resumen?.ultimoCorto && (
        <Aviso tono="aviso" className="text-apoyo">
          El último pago queda más corto que los demás. Si el contrato termina el{' '}
          <span className="tabular-nums">{fechaCorta(sugerenciaFin)}</span>, todos los pagos salen completos.
        </Aviso>
      )}
    </div>
  );
}
