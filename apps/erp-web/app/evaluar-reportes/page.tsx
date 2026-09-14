import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { TURNO_LABEL, estadoReporte, puede, type MatrizPermisos } from '@scilb/core';
import { listarReportes } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';

// Landing dedicado "Evaluación de Reporte" (como ítem aparte del SCI viejo): solo los
// reportes pendientes de evaluar, con acceso directo a evaluarlos. El detalle de cada
// reporte ya trae el panel de evaluación (3 estados + mapa).
//
// Gate server-side (Fase 1): antes 'evaluar_reportes'.'ver' solo ocultaba el sidebar.
export default async function EvaluarReportesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'evaluar_reportes', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const reportes = await listarReportes();
  const pendientes = reportes.filter((r) => estadoReporte(r) === 'pendiente');

  return (
    <div>
      <PageHeader
        title="Evaluación de reportes"
        subtitle={`${pendientes.length} reporte(s) pendientes de evaluar`}
      />

      {pendientes.length === 0 ? (
        <Card>
          <CardContent className="pb-0">
            <EmptyState icon={ClipboardCheck} titulo="Todo al día">
              No hay reportes pendientes de evaluación. Cuando un turno envíe su reporte de actividades aparecerá aquí.
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
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
                  <TH className="text-right">Act.</TH>
                  <TH className="pr-5" />
                </TR>
              </THead>
              <TBody>
                {pendientes.map((r) => (
                  <TR key={r.id}>
                    <TD className="pl-5">
                      <span className="inline-block rounded-r-pastilla bg-navy px-2.5 py-1 tabular-nums text-dato font-medium text-paper">
                        {r.id}
                      </span>
                    </TD>
                    <TD className="tabular-nums">{r.sedeCod}</TD>
                    <TD className="tabular-nums text-dato text-muted">{r.fecha}</TD>
                    <TD>
                      <Badge tone="navy">{TURNO_LABEL[r.turno] ?? r.turno}</Badge>
                    </TD>
                    <TD>{r.encargadoNombre ?? '—'}</TD>
                    <TD className="text-right tabular-nums">
                      {r.actDone}/{r.actTotal}
                    </TD>
                    <TD className="pr-5 text-right">
                      <Link
                        href={`/reportes/${r.id}`}
                        className={cn(buttonVariants({ variant: 'primary' }), 'px-3 py-1.5 text-apoyo')}
                      >
                        Evaluar <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
