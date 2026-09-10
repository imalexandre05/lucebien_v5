import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, Coins, Shirt } from 'lucide-react';
import { accesoColaboradores } from '../../../lib/colaboradores-acceso';
import { obtenerColaborador, estadoDeColaborador } from '../../../lib/colaboradores-repo';
import { pendientesDelPeriodo, corteDelHilo } from '../../../lib/colaboradores-pasos';
import { rutaSeccion } from '../../../lib/colaboradores-secciones';
import { miDesempeno } from '../../../lib/desempeno-repo';
import { leerPeriodo, queryPeriodo, etiquetaPeriodo } from '../../../lib/periodo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { StatBox } from '../../../components/ui/stat-box';
import { EmptyState } from '../../../components/ui/empty-state';
import { HiloPago } from '../../../components/colaboradores/hilo-pago';

// El resumen contesta dos preguntas, en este orden: qué falta para cerrar el período, y qué pasó
// en él. El orden importa: lo primero es accionable y lo segundo es contexto.

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export default async function ResumenColaboradorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
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
  const extrasTotal = desempeno.extras.reduce((s, e) => s + e.montoTotal, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Qué falta para cerrar el período</CardTitle>
          <span className="text-xs text-muted">{etiquetaPeriodo(periodo)}</span>
        </CardHeader>
        <CardContent>
          <HiloPago pasos={pasos} hrefDe={(p) => rutaSeccion(persona.id, p.seccion, query)} className="mt-1" />
          <p className="mt-5 border-t border-line/60 pt-3 text-xs leading-relaxed text-muted">
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
          valor={soles(extrasTotal)}
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
                      <TD className="tabular-nums text-xs">{r.fecha}</TD>
                      <TD className="text-xs">{r.turno}</TD>
                      <TD className="text-right tabular-nums text-xs">
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
                      <TD className="tabular-nums text-xs">{i.fecha}</TD>
                      <TD className="text-xs">{i.tipo}</TD>
                      <TD className="text-right text-xs">{i.nivel}</TD>
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
