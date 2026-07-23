import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  type EstadoReporte,
} from '@scilb/core';
import { obtenerReporte, listarLayoutZonas } from '../../../lib/reportes-repo';
import { getSesion } from '../../../lib/auth';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';
import { LogoMark } from '../../../components/brand/logo';
import { PrintButton } from '../../../components/print-button';
import { LayoutMap } from '../layout-map';
import { EvaluarPanel, AccionesAdmin } from './acciones';

const ESTADO_TONE: Record<EstadoReporte, Tone> = {
  evaluado: 'green',
  pendiente: 'amber',
  no_evaluable: 'gray',
};

const esLimpieza = (cod: string) => cod.startsWith('OL_');

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
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  const puedeEvaluar = !r.evaluado && !r.noEvaluable;

  // Separa actividades regulares de las de limpieza (OL_), que se muestran en el mapa.
  const regulares = r.actividades.filter((a) => !esLimpieza(a.cod));
  const limpiezaActs = r.actividades.filter((a) => esLimpieza(a.cod));
  const limpiezaCods = limpiezaActs.map((a) => a.cod.slice(3));
  // Solo las zonas REALMENTE registradas en este reporte (no el layout completo de la sede):
  // masivo, ciclado, estado inicial y envío deben operar sobre el mismo conjunto exacto.
  const zonasSede = limpiezaCods.length ? await listarLayoutZonas(r.sedeCod) : [];
  const zonas = zonasSede.filter((z) => limpiezaCods.includes(z.cod));

  return (
    <div className="max-w-5xl">
      {/* Encabezado de documento — solo impresión (§4F): crest + folio mono + filete gold. */}
      <header className="mb-6 hidden print:block">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <LogoMark size="md" />
            <div>
              <div className="font-display text-2xl font-semibold leading-none text-navy">
                Reporte diario de actividades
              </div>
              <div className="mt-1 text-xs text-muted">
                LuceBien · Confecciones Aliaga E.I.R.L. · Huancayo
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm font-semibold text-navy">{r.id}</div>
            <div className="mt-1 font-mono text-[11px] text-muted">
              {r.sedeCod} · {TURNO_LABEL[r.turno] ?? r.turno} · {r.fecha}
            </div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              {ESTADO_REPORTE_LABEL[estado]}
            </div>
          </div>
        </div>
        <div className="gold-rule mt-4" />
      </header>

      <div className="print:hidden">
        <PageHeader
          title={`Reporte · ${TURNO_LABEL[r.turno] ?? r.turno}`}
          subtitle={`${r.sedeCod} · ${r.fecha}`}
          action={
            <div className="flex items-center gap-3">
              <Badge tone={ESTADO_TONE[estado]}>{ESTADO_REPORTE_LABEL[estado]}</Badge>
              <PrintButton />
            </div>
          }
        />
      </div>

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

      {/* Pendiente de evaluación → panel de evaluar (mapa + actividades en 3 estados).
          En impresión el panel interactivo se omite: el documento queda como constancia. */}
      {puedeEvaluar ? (
        <div className="print:hidden">
          <EvaluarPanel
            id={r.id}
            actividades={regulares.map((a) => ({ cod: a.cod, nombre: a.nombre, cat: a.cat, peso: a.peso, calificacion: a.calificacion }))}
            limpieza={limpiezaActs.map((a) => ({ zoneCod: a.cod.slice(3), peso: a.peso, calificacion: a.calificacion }))}
            zonas={zonas}
            turno={r.turno}
            trabajadores={r.trabajadores}
          />
        </div>
      ) : (
        <>
          {zonas.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-navy">Limpieza</h2>
              <Card>
                <CardContent>
                  <LayoutMap zonas={zonas} turno={r.turno} selected={limpiezaCods} readOnly />
                </CardContent>
              </Card>
            </>
          )}

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
                  {regulares.map((a) => (
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
                  {regulares.length === 0 && (
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
        </>
      )}

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
                    <TH>Quién lo hizo</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH className="pr-5 text-right">Monto</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.extras.map((e) => (
                    <TR key={e.id}>
                      <TD className="pl-5">{e.tipo}</TD>
                      <TD>{e.detalle || e.nombre}</TD>
                      <TD className="text-xs text-muted">{e.registradoPorNombre ?? '—'}</TD>
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

      {esAdmin && (
        <div className="print:hidden">
          <AccionesAdmin id={r.id} evaluado={r.evaluado} />
        </div>
      )}

      <Link
        href="/reportes"
        className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy print:hidden"
      >
        ← Volver a reportes
      </Link>

      {/* Pie de documento — solo impresión. */}
      <footer className="mt-8 hidden items-center justify-between border-t border-line pt-3 font-mono text-[10px] text-muted print:flex">
        <span>SCI-LB · Sistema de Control Interno</span>
        <span>
          {r.id} · impreso {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date())}
        </span>
      </footer>
    </div>
  );
}
