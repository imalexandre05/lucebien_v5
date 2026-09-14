import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { TURNO_LABEL, ESTADO_REPORTE_LABEL, estadoReporte, type Reporte } from '@scilb/core';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';
import { ESTADO_TONE, Puntaje } from './constantes';

// "Mis reportes" (spec 2026-09-12): quien llena el turno hoy no tenía forma de ver si lo que
// mandó ya se evaluó -- el historial completo vive en /administracion/reportes, detrás del
// permiso 'reportes_admin' que un operativo no tiene. Este bloque muestra sólo SUS reportes
// (el filtro por encargado_id vive en listarReportesDe, lib/reportes-repo.ts) y cada fila
// linkea a /reportes/[id], que ya sabe qué mostrarle a un no-admin -- puntaje general sí, puntos
// de extras no (decisión de Fase 5, sin tocar acá).
export function MisReportes({ reportes }: { reportes: Reporte[] }) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-cuerpo font-semibold text-navy">Mis reportes recientes</h2>
      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {reportes.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo="Todavía no enviaste ningún reporte">
              Acá vas a ver el estado de cada turno que reportes.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Fecha</TH>
                  <TH>Turno</TH>
                  <TH>Sede</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Puntaje</TH>
                </TR>
              </THead>
              <TBody>
                {reportes.map((r) => {
                  const est = estadoReporte(r);
                  return (
                    <TR key={r.id}>
                      <TD className="pl-5 tabular-nums text-dato text-muted">
                        <Link
                          href={`/reportes/${r.id}`}
                          className="text-navy transition-colors duration-150 hover:text-gold-deep hover:underline"
                        >
                          {r.fecha}
                        </Link>
                      </TD>
                      <TD>{TURNO_LABEL[r.turno] ?? r.turno}</TD>
                      <TD className="tabular-nums">{r.sedeCod}</TD>
                      <TD>
                        <Badge tone={ESTADO_TONE[est]}>{ESTADO_REPORTE_LABEL[est]}</Badge>
                      </TD>
                      <TD className="pr-5 text-right">
                        <Puntaje r={r} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
