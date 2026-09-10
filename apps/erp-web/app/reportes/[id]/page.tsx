import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  TURNO_LABEL,
  estadoReporte,
  ESTADO_REPORTE_LABEL,
  puede,
  type EstadoReporte,
  type MatrizPermisos,
} from '@scilb/core';
import { obtenerReporte, listarLayoutZonas } from '../../../lib/reportes-repo';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
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
  // Gate server-side (Fase 1): mismo criterio que /reportes (lista) — antes solo se ocultaba del
  // sidebar, cualquiera con la URL directa (o el id) entraba igual al detalle de cualquier sede.
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'reportes', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const r = await obtenerReporte(params.id);
  if (!r) notFound();
  const estado = estadoReporte(r);
  const esAdmin = sesion.usuario.rol === 'admin' || sesion.usuario.rol === 'dueno';
  const puedeEvaluar = !r.evaluado && !r.noEvaluable;
  // Fase 4 tarea 1: a quién manda "← Volver" — el que puede ver el historial vuelve a la lista
  // (/administracion/reportes), el resto vuelve a su formulario del turno (/reportes/nuevo).
  const puedeVerLista = puede(matriz, sesion.usuario.rol, 'reportes_admin', 'ver', sesion.usuario.rolCod);
  // Fase 5 tarea 3: los puntos de los extras son insumo interno de desempeño/pago, no
  // información de mostrador — decisión explícita del dueño. Se muestran solo a quien tiene
  // administración ('reportes_admin') o evaluación ('evaluar_reportes') de reportes; el mismo
  // operativo que ve su propio reporte enviado ('reportes'.'ver', mucho más amplio) no los ve.
  const puedeVerPuntosExtras =
    puedeVerLista || puede(matriz, sesion.usuario.rol, 'evaluar_reportes', 'ver', sesion.usuario.rolCod);

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
              <div className="text-2xl font-semibold leading-none text-navy">
                Reporte diario de actividades
              </div>
              <div className="mt-1 text-xs text-muted">
                LuceBien · Confecciones Aliaga E.I.R.L. · Huancayo
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="tabular-nums text-sm font-semibold text-navy">{r.id}</div>
            <div className="mt-1 tabular-nums text-micro text-muted">
              {r.sedeCod} · {TURNO_LABEL[r.turno] ?? r.turno} · {r.fecha}
            </div>
            <div className="mt-0.5 text-rotulo font-medium uppercase text-muted">
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
              {r.estadoEnvio === 'no_enviado' && <Badge tone="amber">No enviado</Badge>}
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
              <span className="tabular-nums">{r.sedeCod}</span>
            </Campo>
            <Campo label="Turno">{TURNO_LABEL[r.turno] ?? r.turno}</Campo>
            <Campo label="Encargado">{r.encargadoNombre ?? '—'}</Campo>
            <Campo label="Evaluador">{r.evaluadorNombre ?? '—'}</Campo>
            <Campo label="Actividades hechas">
              <span className="tabular-nums">
                {r.actDone}/{r.actTotal}
              </span>
            </Campo>
            <Campo label="Puntaje">
              <span className="tabular-nums">
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
                      <TD className="pl-5 tabular-nums text-xs">{a.cod}</TD>
                      <TD>{a.nombre}</TD>
                      <TD className="tabular-nums text-xs text-muted">{a.cat ?? '—'}</TD>
                      <TD className="text-right tabular-nums">
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
                    <TH className="text-right">Monto</TH>
                    {/* Puntos (Fase 5 tarea 3): solo administración/evaluación — ver
                        puedeVerPuntosExtras arriba. El operativo no llega a ver esta columna. */}
                    {puedeVerPuntosExtras && <TH className="pr-5 text-right">Puntos</TH>}
                  </TR>
                </THead>
                <TBody>
                  {r.extras.map((e) => (
                    <TR key={e.id}>
                      <TD className="pl-5">{e.tipo}</TD>
                      <TD className="flex items-center gap-1.5">
                        {e.detalle || e.nombre}
                        {puedeVerPuntosExtras && e.revisar && <Badge tone="amber">A revisar</Badge>}
                      </TD>
                      <TD className="text-xs text-muted">{e.registradoPorNombre ?? '—'}</TD>
                      <TD className="text-right tabular-nums">{e.cantidad}</TD>
                      <TD className="text-right tabular-nums">S/ {e.montoTotal.toFixed(2)}</TD>
                      {puedeVerPuntosExtras && (
                        <TD className="pr-5 text-right tabular-nums">{e.puntosTotal}</TD>
                      )}
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
        href={puedeVerLista ? '/administracion/reportes' : '/reportes/nuevo'}
        className="mt-4 inline-block text-sm text-muted transition-colors duration-150 hover:text-navy print:hidden"
      >
        ← Volver a {puedeVerLista ? 'reportes' : 'mi turno'}
      </Link>

      {/* Pie de documento — solo impresión. */}
      <footer className="mt-8 hidden items-center justify-between border-t border-line pt-3 tabular-nums text-micro text-muted print:flex">
        <span>SCI-LB · Sistema de Control Interno</span>
        <span>
          {r.id} · impreso {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date())}
        </span>
      </footer>
    </div>
  );
}
