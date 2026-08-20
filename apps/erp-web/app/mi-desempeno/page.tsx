import { redirect } from 'next/navigation';
import { TURNO_LABEL, tramoEval, TRAMO_LABEL, type TramoEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { miDesempeno } from '../../lib/desempeno-repo';
import { mesPeru } from '../../lib/fechas';
import { tieneReauth } from '../../lib/reauth';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { ClipboardList, Award, AlertTriangle } from 'lucide-react';

const TRAMO_TONE: Record<TramoEval, Tone> = {
  excelente: 'green',
  bueno: 'navy',
  mejorar: 'amber',
  bajo: 'gray',
};

// Panel individual (Fase 3): cada usuario ve SOLO sus propios movimientos del mes — reportes
// como encargado, extras que registró, incidencias donde es responsable, puntos de pipeline y
// su última evaluación. Se accede desde el avatar del topbar. Nada de esto es visible para
// terceros (consultas acotadas al propio id, ver lib/desempeno-repo.ts).
export default async function MiDesempenoPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  // Reautenticación (Fase 1): "mi desempeño" es propio (no de terceros), pero igual muestra
  // evaluación/puntos/incidencias con el nombre del empleado a la vista de quien pase por la PC.
  if (!(await tieneReauth(sesion.usuario.id))) {
    return (
      <div>
        <PageHeader title="Mi desempeño" subtitle="Verificación requerida" />
        <ReauthGate mensaje="Tu desempeño y evaluación son información personal." />
      </div>
    );
  }

  const mes = mesPeru();
  const [y, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const desde = `${mes}-01`;
  const hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

  const d = await miDesempeno(sesion.usuario.id, desde, hasta);
  const extrasTotal = d.extras.reduce((s, e) => s + e.montoTotal, 0);
  const tramo = d.ultimaEvaluacion ? tramoEval(d.ultimaEvaluacion.notaFinal) : null;

  return (
    <div>
      <PageHeader title="Mi desempeño" subtitle={`${sesion.nombre} · ${mes}`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Reportes del mes" valor={d.reportes.length} tone="navy" />
        <StatBox index={1} label="Puntos pipeline" valor={d.puntosPipeline} tone="gold" />
        <StatBox index={2} label="Extras" valor={`S/ ${extrasTotal.toFixed(2)}`} tone="exito" />
        <StatBox index={3} label="Incidencias" valor={d.incidencias.length} tone="neutro" />
      </div>

      {d.ultimaEvaluacion && tramo && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Última evaluación</CardTitle>
            <Badge tone={TRAMO_TONE[tramo]}>
              {d.ultimaEvaluacion.notaFinal.toFixed(2)} · {TRAMO_LABEL[tramo]}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">Mes evaluado: {d.ultimaEvaluacion.mes}</p>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Mis reportes de este mes</CardTitle>
        </CardHeader>
        <CardContent className={d.reportes.length ? 'px-0 pb-0' : 'pb-0'}>
          {d.reportes.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo="Sin reportes este mes" compacto>
              Cuando seas encargado de un turno, aparecerá aquí.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Fecha</TH>
                  <TH>Turno</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Puntaje</TH>
                </TR>
              </THead>
              <TBody>
                {d.reportes.map((r) => (
                  <TR key={r.id}>
                    <TD className="pl-5 font-mono text-xs text-muted">{r.fecha}</TD>
                    <TD>{TURNO_LABEL[r.turno as keyof typeof TURNO_LABEL] ?? r.turno}</TD>
                    <TD>
                      <Badge tone={r.evaluado ? 'green' : 'amber'}>{r.evaluado ? 'Evaluado' : 'Pendiente'}</Badge>
                    </TD>
                    <TD className="pr-5 text-right font-mono tabular-nums">{r.puntajeEval ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Mis extras registrados</CardTitle>
        </CardHeader>
        <CardContent className={d.extras.length ? 'px-0 pb-0' : 'pb-0'}>
          {d.extras.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Sin extras registrados este mes.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Fecha</TH>
                  <TH>Descripción</TH>
                  <TH className="pr-5 text-right">Monto</TH>
                </TR>
              </THead>
              <TBody>
                {d.extras.map((e) => (
                  <TR key={e.id}>
                    <TD className="pl-5 font-mono text-xs text-muted">{e.fecha}</TD>
                    <TD>{e.nombre}</TD>
                    <TD className="pr-5 text-right font-mono tabular-nums">S/ {e.montoTotal.toFixed(2)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d.incidencias.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Incidencias donde soy responsable</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Fecha</TH>
                  <TH>Tipo</TH>
                  <TH className="pr-5">Gravedad</TH>
                </TR>
              </THead>
              <TBody>
                {d.incidencias.map((i) => (
                  <TR key={i.id}>
                    <TD className="pl-5 font-mono text-xs text-muted">{i.fecha}</TD>
                    <TD>{i.tipo}</TD>
                    <TD className="pr-5">
                      <span
                        className={
                          i.nivel === 'Alto'
                            ? 'rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700'
                            : i.nivel === 'Medio'
                              ? 'rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700'
                              : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600'
                        }
                      >
                        {i.nivel}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!d.ultimaEvaluacion && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> Aún no tienes una evaluación mensual registrada.
        </p>
      )}
    </div>
  );
}
