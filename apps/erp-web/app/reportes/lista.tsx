'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Filter } from 'lucide-react';
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
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { cn } from '../../lib/cn';

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

const OPC_FILTRO_TURNO: Opcion[] = [
  { value: '', label: 'Todos los turnos' },
  { value: 'M', label: 'Mañana' },
  { value: 'T', label: 'Tarde' },
  { value: 'C', label: 'Día completo' },
];
const OPC_FILTRO_ESTADO: Opcion<FiltroEstado>[] = (Object.keys(ESTADO_FILTRO_LABEL) as FiltroEstado[]).map((k) => ({
  value: k,
  label: ESTADO_FILTRO_LABEL[k],
}));

function Puntaje({ r }: { r: Reporte }) {
  if (!r.evaluado) return <span className="text-muted">—</span>;
  const p = r.puntajeEval ?? r.puntaje;
  const cls = p >= 85 ? 'bg-emerald-600/10 text-emerald-700' : p >= 60 ? 'bg-gold/20 text-gold-deep' : 'bg-red-50 text-red-700';
  return <span className={cn('rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums', cls)}>{p}%</span>;
}

export function ReportesLista({ reportes }: { reportes: Reporte[] }) {
  const [q, setQ] = useState('');
  const [sede, setSede] = useState('');
  const [turno, setTurno] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('utiles');

  const sedes = useMemo(() => [...new Set(reportes.map((r) => r.sedeCod))].sort(), [reportes]);
  const pendientes = useMemo(() => reportes.filter((r) => estadoReporte(r) === 'pendiente').length, [reportes]);

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
      {pendientes > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <ClipboardCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          Hay <strong className="font-semibold">{pendientes}</strong> reporte(s) pendientes de evaluación.
          <button
            type="button"
            onClick={() => setEstado('pendiente')}
            className="ml-auto rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors duration-150 hover:bg-amber-100 active:scale-[0.97]"
          >
            Ver pendientes
          </button>
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por id, sede o encargado…"
            className={`${fieldCls} min-w-[14rem] flex-1`}
          />
          <select value={sede} onChange={(e) => setSede(e.target.value)} className={fieldCls} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <OpcionBotones opciones={OPC_FILTRO_TURNO} value={turno} onChange={setTurno} ariaLabel="Turno" />
          <OpcionBotones opciones={OPC_FILTRO_ESTADO} value={estado} onChange={setEstado} ariaLabel="Estado" />
          <span className="ml-auto font-mono text-xs text-muted tabular-nums">
            {filtrados.length} reportes
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Reporte</TH>
                <TH>Sede</TH>
                <TH>Fecha</TH>
                <TH>Turno</TH>
                <TH>Encargado</TH>
                <TH className="text-center">Equipo</TH>
                <TH className="text-right">Act.</TH>
                <TH className="text-right">Puntaje</TH>
                <TH>Estado</TH>
                <TH className="pr-5">Evaluador</TH>
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
                        className="inline-block rounded-md bg-navy px-2.5 py-1 font-mono text-xs font-medium text-paper transition-colors duration-150 hover:bg-navy-dark"
                      >
                        {r.id}
                      </Link>
                    </TD>
                    <TD className="font-mono">{r.sedeCod}</TD>
                    <TD className="font-mono text-xs text-muted">{r.fecha}</TD>
                    <TD>
                      <Badge tone="navy">{TURNO_LABEL[r.turno] ?? r.turno}</Badge>
                    </TD>
                    <TD>{r.encargadoNombre ?? '—'}</TD>
                    <TD className="text-center">
                      {r.trabajadores.length > 0 ? (
                        <span
                          title={r.trabajadores.join(', ')}
                          className="inline-flex items-center rounded-full bg-navy/5 px-2 py-0.5 font-mono text-xs text-navy"
                        >
                          {r.trabajadores.length}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD className="text-right font-mono tabular-nums">
                      {r.actDone}/{r.actTotal}
                    </TD>
                    <TD className="text-right">
                      <Puntaje r={r} />
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={ESTADO_TONE[est]}>{ESTADO_REPORTE_LABEL[est]}</Badge>
                        {/* Tarea 4: distingue un envío real de uno auto-cerrado con contenido —
                            "pendiente" solo no dice si alguien le dio a Enviar o venció el plazo. */}
                        {r.estadoEnvio === 'no_enviado' && <Badge tone="amber">No enviado</Badge>}
                      </div>
                    </TD>
                    <TD className="pr-5 text-sm text-muted">{r.evaluadorNombre ?? '—'}</TD>
                  </TR>
                );
              })}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={10}>
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
