import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  type EstadoReporte,
} from '@scilb/core';
import { obtenerReporte } from '../../../lib/reportes-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';

const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/60 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy">{children}</dd>
    </div>
  );
}

export default async function ReporteDetalle({ params }: { params: { id: string } }) {
  const r = await obtenerReporte(params.id);
  if (!r) notFound();
  const estado = estadoReporte(r);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Reporte · ${TURNO_LABEL[r.turno] ?? r.turno}`}
        subtitle={`${r.sedeCod} · ${r.fecha}`}
        action={<Badge tone={ESTADO_TONE[estado]}>{ESTADO_REPORTE_LABEL[estado]}</Badge>}
      />

      <Card>
        <CardContent className="pt-2">
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <Campo label="Sede">
              <span className="font-mono">{r.sedeCod}</span>
            </Campo>
            <Campo label="Turno">{TURNO_LABEL[r.turno] ?? r.turno}</Campo>
            <Campo label="Encargado">{r.encargadoNombre ?? '—'}</Campo>
            <Campo label="Evaluador">{r.evaluadorNombre ?? '—'}</Campo>
            <Campo label="Actividades hechas">
              <span className="font-mono tabular-nums">
                {r.actDone}/{r.actTotal}
              </span>
            </Campo>
            <Campo label="Puntaje">
              <span className="font-mono tabular-nums">
                {r.evaluado ? r.puntajeEval ?? r.puntaje : '— (sin evaluar)'}
              </span>
            </Campo>
          </dl>

          {r.trabajadores.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-muted">Trabajadores del turno</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {r.trabajadores.map((t) => (
                  <Badge key={t} tone="navy">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-navy">Actividades</h2>
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Código</TH>
                <TH>Actividad</TH>
                <TH>Categoría</TH>
                <TH className="text-right">Calificación</TH>
                <TH className="pr-5">Observación</TH>
              </TR>
            </THead>
            <TBody>
              {r.actividades.map((a) => (
                <TR key={a.id}>
                  <TD className="pl-5 font-mono text-xs">{a.cod}</TD>
                  <TD>{a.nombre}</TD>
                  <TD className="font-mono text-xs text-muted">{a.cat ?? '—'}</TD>
                  <TD className="text-right font-mono tabular-nums">
                    {a.calificacion == null ? '—' : a.calificacion}
                  </TD>
                  <TD className="pr-5 text-xs text-muted">{a.obsEval || a.obs || '—'}</TD>
                </TR>
              ))}
              {r.actividades.length === 0 && (
                <TR>
                  <TD className="px-5 py-6 text-center text-muted" colSpan={5}>
                    Sin actividades registradas.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {r.extras.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-navy">Extras</h2>
          <Card>
            <CardContent className="px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Tipo</TH>
                    <TH>Detalle</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH className="pr-5 text-right">Monto</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.extras.map((e) => (
                    <TR key={e.id}>
                      <TD className="pl-5">{e.tipo}</TD>
                      <TD>{e.detalle || e.nombre}</TD>
                      <TD className="text-right font-mono tabular-nums">{e.cantidad}</TD>
                      <TD className="pr-5 text-right font-mono tabular-nums">S/ {e.montoTotal.toFixed(2)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Link
        href="/reportes"
        className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy"
      >
        ← Volver a reportes
      </Link>
    </div>
  );
}
