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
import { campoCls } from '../../components/ui/form';
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

const fieldCls = campoCls;

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
  const cls = p >= 85 ? 'bg-exito/10 text-exito-deep' : p >= 60 ? 'bg-gold/20 text-gold-deep' : 'bg-error-soft text-error-deep';
  return <span className={cn('rounded-r-pastilla px-2.5 py-0.5 tabular-nums text-xs font-bold', cls)}>{p}%</span>;
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
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-aviso-line bg-aviso-soft px-4 py-2.5 text-sm text-aviso-deep">
          <ClipboardCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          Hay <strong className="font-semibold">{pendientes}</strong> reporte(s) pendientes de evaluación.
          <button
            type="button"
            onClick={() => setEstado('pendiente')}
            className="ml-auto rounded-md border border-aviso-line px-2.5 py-1 text-xs font-medium text-aviso-deep transition-colors duration-150 hover:bg-aviso-soft active:scale-[0.97]"
          >
            Ver pendientes
          </button>
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
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
          <span className="ml-auto tabular-nums text-xs text-muted">
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
                        className="toque inline-block rounded-md bg-navy px-2.5 py-1 tabular-nums text-xs font-medium text-paper transition-colors duration-150 hover:bg-navy-dark"
                      >
                        {r.id}
                      </Link>
                    </TD>
                    <TD className="tabular-nums">{r.sedeCod}</TD>
                    <TD className="tabular-nums text-xs text-muted">{r.fecha}</TD>
                    <TD>
                      <Badge tone="navy">{TURNO_LABEL[r.turno] ?? r.turno}</Badge>
                    </TD>
                    <TD>{r.encargadoNombre ?? '—'}</TD>
                    <TD className="text-center">
                      {r.trabajadores.length > 0 ? (
                        <span
                          title={r.trabajadores.join(', ')}
                          className="inline-flex items-center rounded-r-pastilla bg-navy/5 px-2 py-0.5 tabular-nums text-xs text-navy"
                        >
                          {r.trabajadores.length}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
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
