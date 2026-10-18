import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, Coins, Shirt } from 'lucide-react';
import { accesoColaboradores } from '../../../lib/colaboradores-acceso';
import { obtenerColaborador, estadoDeColaborador } from '../../../lib/colaboradores-repo';
import { pendientesDelPeriodo, corteDelHilo } from '../../../lib/colaboradores-pasos';
import { rutaSeccion } from '../../../lib/colaboradores-secciones';
import { miDesempeno } from '../../../lib/desempeno-repo';
import { metaPagoPorPuntos } from '../../../lib/config-repo';
import { componentesEvaluacion } from '../../../lib/evaluaciones-repo';
import { leerPeriodo, queryPeriodo, etiquetaPeriodo } from '../../../lib/periodo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { StatBox } from '../../../components/ui/stat-box';
import { Aviso } from '../../../components/ui/form';
import { EmptyState } from '../../../components/ui/empty-state';
import type { ParametrosSueldo } from '@scilb/core';
import { listarAcuerdos, type AcuerdoSueldo } from '../../../lib/sueldos-repo';
import { parametrosEfectivos } from '../../../lib/contrato-efectivo';
import { SuConfiguracion } from './su-configuracion';
import { HiloPago } from '../../../components/colaboradores/hilo-pago';

// El resumen contesta dos preguntas, en este orden: qué falta para cerrar el período, y qué pasó
// en él. El orden importa: lo primero es accionable y lo segundo es contexto.

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export default async function ResumenColaboradorPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const acceso = await accesoColaboradores();
  if (!acceso) redirect('/login');

  const periodo = leerPeriodo(searchParams);
  const query = queryPeriodo(periodo);

  if (!acceso.secciones.includes('resumen')) {
    // Un rol sin 'resumen' (p.ej. sólo 'pagos') puede tener igual otras secciones habilitadas: se
    // lo manda a la PRIMERA que sí puede ver, con el período puesto, en vez de rebotarlo a la
    // lista — el bare /personal/{id} es justo el link que usa la lista (ROTURA 2, hotfix R1.1). El
    // rol queda parado en un bucle cerrado si no: la lista lo manda acá y acá lo manda a la lista.
    // Sólo si no le queda NINGUNA sección se vuelve a /personal, que es el único lugar donde ese
    // rol puede estar parado.
    if (acceso.secciones.length === 0) redirect('/personal');
    redirect(rutaSeccion(params.id, acceso.secciones[0], query));
  }

  const persona = await obtenerColaborador(params.id);
  if (!persona) notFound();

  const [estado, desempeno] = await Promise.all([
    estadoDeColaborador(persona.id, periodo),
    miDesempeno(persona.id, periodo.desde, periodo.hasta),
  ]);

  const pasos = pendientesDelPeriodo(estado);
  const corte = corteDelHilo(pasos);
  // Los extras se miden en puntos, no en soles (decisión del dueño, 05-oct-2026).
  const extrasPuntos = Math.round(desempeno.extras.reduce((s, e) => s + e.puntosTotal, 0) * 100) / 100;

  // Pago por puntos (spec sueldos/2026-10-05-pago-por-puntos-design.md §5): sólo si está activo.
  const metaPuntos = await metaPagoPorPuntos();
  const puntosPeriodo =
    metaPuntos !== null
      ? ((await componentesEvaluacion(persona.id, periodo.desde, periodo.hasta).catch(() => null))?.puntosTotal ?? null)
      : null;
  // «Su configuración» (decisión del dueño n.º 5): sólo el administrador, porque es lo pactado con la
  // persona (sueldo incluido). El contrato que se muestra es el que toca el período; si ninguno, el último.
  const esAdmin = acceso.sesion.usuario.rol === 'admin' || acceso.sesion.usuario.rol === 'dueno';
  let contrato: AcuerdoSueldo | null = null;
  let parametrosContrato: ParametrosSueldo | null = null;
  if (esAdmin) {
    const acuerdos = (await listarAcuerdos(persona.id).catch(() => [])).filter((a) => a.estado !== 'liquidado');
    contrato =
      acuerdos.find((a) => a.fechaInicio <= periodo.hasta && (a.fechaFin ?? '9999-12-31') >= periodo.desde) ??
      acuerdos[0] ??
      null;
    parametrosContrato = contrato ? await parametrosEfectivos(contrato).catch(() => null) : null;
  }
  const fmtPuntos = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Qué falta para cerrar el período</CardTitle>
          <span className="text-apoyo text-muted">{etiquetaPeriodo(periodo)}</span>
        </CardHeader>
        <CardContent>
          <HiloPago pasos={pasos} hrefDe={(p) => rutaSeccion(persona.id, p.seccion, query)} className="mt-1" />
          <p className="mt-5 border-t border-line/60 pt-3 text-apoyo leading-relaxed text-muted">
            {corte ? (
              <>
                El período se traba en <strong className="font-semibold text-ink">{corte.titulo.toLowerCase()}</strong>:{' '}
                {corte.detalle.toLowerCase()}.{' '}
                <Link
                  href={rutaSeccion(persona.id, corte.seccion, query)}
                  className="font-medium text-navy underline decoration-gold decoration-2 underline-offset-2 hover:text-navy-dark"
                >
                  Resolverlo
                </Link>
                .
              </>
            ) : (
              <>
                Los cinco pasos están resueltos. La liquidación de este período puede correr sin que el motor
                la corte.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {metaPuntos !== null && puntosPeriodo !== null && (
        <Aviso tono="info">
          En este período lleva <span className="tabular-nums font-semibold">{fmtPuntos(puntosPeriodo)} puntos</span>. Desde{' '}
          <span className="tabular-nums font-semibold">{fmtPuntos(metaPuntos)} puntos</span> al mes cobra extra.
        </Aviso>
      )}

      {esAdmin && (
        <SuConfiguracion
          acuerdo={contrato}
          parametros={parametrosContrato}
          hrefCambiar={rutaSeccion(persona.id, 'contrato', query)}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          index={0}
          label="Reportes enviados"
          valor={estado.reportes}
          tone="navy"
          icon={ClipboardList}
        />
        <StatBox
          index={1}
          label="Puntos de pipeline"
          valor={estado.puntosPipeline}
          tone="gold"
          icon={Shirt}
        />
        <StatBox
          index={2}
          label="Extras registrados"
          valor={`${extrasPuntos} pts`}
          sub={`${desempeno.extras.length} en el período`}
          size="md"
          tone="exito"
          icon={Coins}
        />
        <StatBox
          index={3}
          label="Incidencias"
          valor={estado.incidencias}
          tone={estado.incidencias > 0 ? 'aviso' : 'neutro'}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reportes del período</CardTitle>
            <Badge tone={desempeno.reportes.length ? 'navy' : 'gray'}>{desempeno.reportes.length}</Badge>
          </CardHeader>
          {desempeno.reportes.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo="Ningún reporte en este período" compacto>
              Los reportes se envían desde Reporte de Actividades, al cerrar el turno.
            </EmptyState>
          ) : (
            <CardContent className="px-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Turno</TH>
                    <TH className="text-right">Puntaje</TH>
                  </TR>
                </THead>
                <TBody>
                  {desempeno.reportes.slice(0, 12).map((r) => (
                    <TR key={r.id}>
                      <TD className="tabular-nums text-dato">{r.fecha}</TD>
                      <TD className="text-apoyo">{r.turno}</TD>
                      <TD className="text-right tabular-nums text-dato">
                        {r.evaluado && r.puntajeEval != null ? (
                          r.puntajeEval.toFixed(1)
                        ) : (
                          <span className="text-muted">sin evaluar</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {desempeno.reportes.length > 12 && (
                <p className="px-5 pt-2 text-micro text-muted">
                  Se muestran los 12 más recientes de {desempeno.reportes.length}.
                </p>
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidencias</CardTitle>
            <Badge tone={desempeno.incidencias.length ? 'amber' : 'gray'}>{desempeno.incidencias.length}</Badge>
          </CardHeader>
          {desempeno.incidencias.length === 0 ? (
            <EmptyState icon={AlertTriangle} titulo="Sin incidencias" compacto>
              No se registró ninguna incidencia con esta persona como responsable.
            </EmptyState>
          ) : (
            <CardContent className="px-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Tipo</TH>
                    <TH className="text-right">Nivel</TH>
                  </TR>
                </THead>
                <TBody>
                  {desempeno.incidencias.map((i) => (
                    <TR key={i.id}>
                      <TD className="tabular-nums text-dato">{i.fecha}</TD>
                      <TD className="text-apoyo">{i.tipo}</TD>
                      <TD className="text-right text-apoyo">{i.nivel}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
