import { redirect } from 'next/navigation';
import { TURNO_LABEL, tramoEval, TRAMO_LABEL, bandaDesdeNota, BANDA_LABEL, type TramoEval, type BandaEval } from '@scilb/core';
import { getSesion } from '../../lib/auth';
import { miDesempeno } from '../../lib/desempeno-repo';
import { leerPesosEval, leerEscalaPuntos } from '../../lib/evaluaciones-repo';
import { mesPeru } from '../../lib/fechas';
import { tieneReauth } from '../../lib/reauth';
import { tengoPin } from '../../lib/pipeline-repo';
import { PinPersonal } from './pin';
import { PageHeader } from '../../components/shell/page-header';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { PerfilComponentes } from '../../components/ui/perfil-componentes';
import { ClipboardList, Award, AlertTriangle } from 'lucide-react';

const TRAMO_TONE: Record<TramoEval, Tone> = {
  excelente: 'green',
  bueno: 'navy',
  mejorar: 'amber',
  bajo: 'gray',
};

// Spec docs/superpowers/specs/evaluaciones/2026-08-25-puntos-como-moneda-design.md §2 C-3/C-5 —
// mismo mapeo que app/evaluaciones/cliente.tsx (BANDA_TONE), duplicado a propósito: TRAMO_TONE de
// arriba ya seguía ese mismo patrón de no compartirse entre pantallas.
const BANDA_TONE: Record<BandaEval, Tone> = {
  riesgo: 'red',
  en_desarrollo: 'amber',
  ideal: 'green',
  sobresaliente: 'gold',
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

  const [d, pesos, escala, tienePin] = await Promise.all([
    miDesempeno(sesion.usuario.id, desde, hasta),
    leerPesosEval(),
    leerEscalaPuntos(),
    tengoPin().catch(() => false),
  ]);
  const extrasTotal = d.extras.reduce((s, e) => s + e.montoTotal, 0);
  // Spec puntos-como-moneda §2 C-5: la última evaluación se lee con el sistema con el que se
  // guardó — banda si 'puntos' (desde el 25-ago-2026), tramo si 'ponderado' (todo lo de antes).
  // La nota (notaFinal) NUNCA se recalcula acá: sale tal cual quedó congelada al guardarse.
  const esPuntos = d.ultimaEvaluacion?.metodo === 'puntos';
  const banda = d.ultimaEvaluacion && esPuntos ? bandaDesdeNota(d.ultimaEvaluacion.notaFinal, escala.bandaRiesgo, escala.bandaIdeal) : null;
  const tramo = d.ultimaEvaluacion && !esPuntos ? tramoEval(d.ultimaEvaluacion.notaFinal) : null;

  return (
    <div>
      <PageHeader title="Mi desempeño" subtitle={`${sesion.nombre} · ${mes}`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Reportes del mes" valor={d.reportes.length} tone="navy" />
        <StatBox index={1} label="Puntos pipeline" valor={d.puntosPipeline} tone="gold" />
        <StatBox index={2} label="Extras" valor={`S/ ${extrasTotal.toFixed(2)}`} tone="exito" />
        <StatBox index={3} label="Incidencias" valor={d.incidencias.length} tone="neutro" />
      </div>

      {d.ultimaEvaluacion && (banda || tramo) && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Última evaluación</CardTitle>
            {banda ? (
              <Badge tone={BANDA_TONE[banda]}>
                {d.ultimaEvaluacion.notaFinal.toFixed(2)} · {BANDA_LABEL[banda]}
              </Badge>
            ) : (
              tramo && (
                <Badge tone={TRAMO_TONE[tramo]}>
                  {d.ultimaEvaluacion.notaFinal.toFixed(2)} · {TRAMO_LABEL[tramo]}
                </Badge>
              )
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-cuerpo text-muted">Mes evaluado: {d.ultimaEvaluacion.mes}</p>
            {/* Perfil propio (spec §2 C-4): en qué es fuerte y en qué flaquea — ya no decide la
                nota, que sale de los puntos del período (o del promedio ponderado en evaluaciones
                viejas). Sin `componentes` guardado (evaluación muy vieja, previa a la migración
                0027) no hay nada que mostrar acá, y se omite en vez de dibujar barras en cero. */}
            {d.ultimaEvaluacion.componentes && (
              <div className="border-t border-line/60 pt-3">
                <PerfilComponentes valoresOculto={d.ultimaEvaluacion.valoresOculto} componentes={d.ultimaEvaluacion.componentes} pesos={d.ultimaEvaluacion.pesosUsados ?? (pesos as unknown as Record<string, number>)} />
              </div>
            )}
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
                    <TD className="pl-5 tabular-nums text-dato text-muted">{r.fecha}</TD>
                    <TD>{TURNO_LABEL[r.turno as keyof typeof TURNO_LABEL] ?? r.turno}</TD>
                    <TD>
                      <Badge tone={r.evaluado ? 'green' : 'amber'}>{r.evaluado ? 'Evaluado' : 'Pendiente'}</Badge>
                    </TD>
                    <TD className="pr-5 text-right tabular-nums">{r.puntajeEval ?? '—'}</TD>
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
            <p className="py-4 text-center text-cuerpo text-muted">Sin extras registrados este mes.</p>
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
                    <TD className="pl-5 tabular-nums text-dato text-muted">{e.fecha}</TD>
                    <TD>{e.nombre}</TD>
                    <TD className="pr-5 text-right tabular-nums">S/ {e.montoTotal.toFixed(2)}</TD>
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
                    <TD className="pl-5 tabular-nums text-dato text-muted">{i.fecha}</TD>
                    <TD>{i.tipo}</TD>
                    <TD className="pr-5">
                      <span
                        className={
                          i.nivel === 'Alto'
                            ? 'rounded-r-pastilla bg-error-soft px-2.5 py-0.5 text-apoyo font-medium text-error-deep'
                            : i.nivel === 'Medio'
                              ? 'rounded-r-pastilla bg-aviso-soft px-2.5 py-0.5 text-apoyo font-medium text-aviso-deep'
                              : 'rounded-r-pastilla bg-paper px-2.5 py-0.5 text-apoyo font-medium text-muted'
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
        <p className="mt-4 flex items-center gap-2 text-apoyo text-muted">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> Aún no tienes una evaluación mensual registrada.
        </p>
      )}

      <PinPersonal tienePin={tienePin} />
    </div>
  );
}
