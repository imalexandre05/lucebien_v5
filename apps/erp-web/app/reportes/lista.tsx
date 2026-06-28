'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  type EstadoReporte,
  type Reporte,
} from '@scilb/core';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';

const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

// 'utiles' = los que tienen contenido (no vacíos); es el default porque ~92% de los
// reportes migrados son cascarones no_evaluable que de otro modo copan la lista.
type FiltroEstado = 'utiles' | 'evaluado' | 'pendiente' | 'no_evaluable' | 'todos';

const ESTADO_FILTRO_LABEL: Record<FiltroEstado, string> = {
  utiles: 'Con contenido',
  evaluado: 'Evaluados',
  pendiente: 'Pendientes',
  no_evaluable: 'Vacíos',
  todos: 'Todos',
};

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

export function ReportesLista({ reportes }: { reportes: Reporte[] }) {
  const [q, setQ] = useState('');
  const [sede, setSede] = useState('');
  const [turno, setTurno] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('utiles');

  const sedes = useMemo(() => [...new Set(reportes.map((r) => r.sedeCod))].sort(), [reportes]);

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reportes.filter((r) => {
      if (sede && r.sedeCod !== sede) return false;
      if (turno && r.turno !== turno) return false;
      const est = estadoReporte(r);
      if (estado === 'utiles' && est === 'no_evaluable') return false;
      if (estado !== 'utiles' && estado !== 'todos' && est !== estado) return false;
      if (needle) {
        const hay = `${r.id} ${r.sedeCod} ${TURNO_LABEL[r.turno] ?? ''} ${r.encargadoNombre ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [reportes, q, sede, turno, estado]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por fecha, sede o encargado…"
          className={`${fieldCls} min-w-[15rem] flex-1`}
        />
        <select value={sede} onChange={(e) => setSede(e.target.value)} className={fieldCls} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {sedes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={turno} onChange={(e) => setTurno(e.target.value)} className={fieldCls} aria-label="Turno">
          <option value="">Todos los turnos</option>
          <option value="M">Mañana</option>
          <option value="T">Tarde</option>
          <option value="C">Día completo</option>
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as FiltroEstado)}
          className={fieldCls}
          aria-label="Estado"
        >
          {(Object.keys(ESTADO_FILTRO_LABEL) as FiltroEstado[]).map((k) => (
            <option key={k} value={k}>
              {ESTADO_FILTRO_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {filtrados.length} de {reportes.length}
        </span>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Sede</TH>
                <TH>Turno</TH>
                <TH>Encargado</TH>
                <TH className="text-right">Actividades</TH>
                <TH className="text-right">Puntaje</TH>
                <TH className="pr-5">Estado</TH>
              </TR>
            </THead>
            <TBody>
              {filtrados.map((r) => {
                const est = estadoReporte(r);
                return (
                  <TR key={r.id}>
                    <TD className="pl-5">
                      <Link
                        href={`/reportes/${r.id}`}
                        className="font-mono font-medium text-navy transition-colors duration-150 hover:text-gold"
                      >
                        {r.fecha}
                      </Link>
                    </TD>
                    <TD className="font-mono">{r.sedeCod}</TD>
                    <TD>
                      <Badge tone="navy">{TURNO_LABEL[r.turno] ?? r.turno}</Badge>
                    </TD>
                    <TD>{r.encargadoNombre ?? '—'}</TD>
                    <TD className="text-right font-mono tabular-nums">
                      {r.actDone}/{r.actTotal}
                    </TD>
                    <TD className="text-right font-mono tabular-nums">
                      {r.evaluado ? r.puntajeEval ?? r.puntaje : '—'}
                    </TD>
                    <TD className="pr-5">
                      <Badge tone={ESTADO_TONE[est]}>{ESTADO_REPORTE_LABEL[est]}</Badge>
                    </TD>
                  </TR>
                );
              })}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    Ningún reporte coincide con el filtro.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
