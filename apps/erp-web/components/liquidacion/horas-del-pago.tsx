'use client';

import { useState } from 'react';
import type { DetalleHoras } from '../../lib/horas-del-pago';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

// El pago por horas, dicho simple (spec sueldo-por-horas §6): tres filas —«Horas trabajadas»,
// «Horas extra» y «Horas que faltaron»— y, si se quiere, el día por día sin salir de la pantalla.
// Sólo MUESTRA lo congelado en la liquidación. Lo usan la vista previa, el detalle, el comprobante
// y «Mi pago».

const soles = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const horas = (n: number): string => `${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** '2026-10-06' → 'mar 6-oct' (día de la semana por aritmética UTC: sin zona horaria). */
function fechaConDia(f: string): string {
  const [y, m, d] = f.split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${d}-${MESES[m - 1]}`;
}

function Fila({ etiqueta, detalle, children }: { etiqueta: string; detalle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <dt className="text-cuerpo font-medium text-navy">{etiqueta}</dt>
        <dd className="text-apoyo text-muted tabular-nums">{detalle}</dd>
      </div>
      <dd className="shrink-0 text-right text-cuerpo tabular-nums text-ink">{children}</dd>
    </div>
  );
}

export function HorasDelPago({ h }: { h: DetalleHoras }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="break-inside-avoid rounded-r-chico border border-line bg-white p-4 print:border-0 print:p-0">
      <h3 className="text-rotulo font-display font-semibold uppercase text-muted">Tus horas</h3>
      <dl className="mt-1 divide-y divide-line">
        <Fila etiqueta="Horas trabajadas" detalle={`${horas(h.horasDentro)} dentro de su horario`}>
          {soles(h.montoDentro)}
        </Fila>
        <Fila etiqueta="Horas extra" detalle={`${horas(h.horasExtra)} fuera de su horario`}>
          {soles(h.montoExtra)}
        </Fila>
        {h.horasFaltaron > 0 && (
          <Fila etiqueta="Horas que faltaron" detalle={`${horas(h.horasFaltaron)} de su horario`}>
            <span className="text-muted">no se pagan</span>
          </Fila>
        )}
      </dl>
      {h.referencia != null && (
        <p className="mt-2 text-cuerpo text-gold-deep tabular-nums">
          Si cumple su horario: <strong>≈ {soles(h.referencia)}</strong>
        </p>
      )}
      {h.dias.length > 0 && (
        <div className="mt-3 print:hidden">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="text-cuerpo text-gold-deep underline"
          >
            {abierto ? 'Ocultar el día por día' : 'Ver día por día'}
          </button>
          {abierto && (
            <div className="mt-2 overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH className="text-right">Su horario</TH>
                    <TH className="text-right">Trabajó</TH>
                    <TH className="text-right">Dentro</TH>
                    <TH className="text-right">Extra</TH>
                    <TH className="text-right">Faltó</TH>
                  </TR>
                </THead>
                <TBody>
                  {h.dias.map((d) => (
                    <TR key={d.fecha}>
                      <TD className="whitespace-nowrap tabular-nums">{fechaConDia(d.fecha)}</TD>
                      <TD className="text-right tabular-nums">{d.horario > 0 ? horas(d.horario) : 'No le tocaba'}</TD>
                      <TD className="text-right tabular-nums">{horas(d.trabajadas)}</TD>
                      <TD className="text-right tabular-nums">{horas(d.dentro)}</TD>
                      <TD className="text-right tabular-nums">{horas(d.extra)}</TD>
                      <TD className="text-right tabular-nums">{horas(d.faltaron)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
