import Link from 'next/link';
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  type EstadoReporte,
} from '@scilb/core';
import { listarReportes } from '../../lib/reportes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';

const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

export default async function ReportesPage() {
  const reportes = await listarReportes();
  return (
    <div>
      <PageHeader title="Reportes FR-01" subtitle={`${reportes.length} reportes · turno M / T / C`} />
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
              {reportes.map((r) => {
                const estado = estadoReporte(r);
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
                      <Badge tone={ESTADO_TONE[estado]}>{ESTADO_REPORTE_LABEL[estado]}</Badge>
                    </TD>
                  </TR>
                );
              })}
              {reportes.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    Sin reportes todavía.
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
