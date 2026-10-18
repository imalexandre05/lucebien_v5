import Link from 'next/link';
import { ArrowLeft, Gauge, PackageCheck, Send, Trophy, Zap } from 'lucide-react';
import { listarPasadas, rankingHoy, movimientosRecientes } from '../../../lib/pipeline-repo';
import { hoyPeru } from '../../../lib/fechas';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { StatBox } from '../../../components/ui/stat-box';
import { EmptyState } from '../../../components/ui/empty-state';

const ETAPAS: Record<string, string> = {
  recepcion: 'Recepción',
  codificacion: 'Codificación',
  lavado: 'Lavado',
  empatado: 'Empatado',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Control calidad',
  listo: 'Listo p/ envío',
  enviado: 'Enviadas',
  recibido: 'Recibidas',
};

const diaLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

// Métricas del pipeline: qué se movió, quién lo movió y dónde está la carga hoy.
export default async function MetricasPage() {
  const [pasadas, ranking, movs] = await Promise.all([listarPasadas(), rankingHoy(), movimientosRecientes(7)]);

  const hoy = hoyPeru();
  const enProceso = pasadas.filter((p) => !['enviado', 'recibido'].includes(p.etapa)).length;
  const listas = pasadas.filter((p) => p.etapa === 'listo').length;
  const enCamino = pasadas.filter((p) => p.etapa === 'enviado').length;
  const movsHoy = movs.filter((m) => m.fecha === hoy).length;
  const ptsHoy = Math.round(ranking.reduce((s, r) => s + r.total, 0) * 10) / 10;

  // Carga actual por etapa (solo etapas con prendas, orden del pipeline).
  const porEtapa = Object.keys(ETAPAS)
    .map((k) => ({ k, n: ETAPAS[k], c: pasadas.filter((p) => p.etapa === k).length }))
    .filter((e) => e.c > 0);
  const maxEtapa = Math.max(1, ...porEtapa.map((e) => e.c));

  // Producción por día (últimos 7): movimientos totales, llegaron a listo, despachadas.
  const dias = Array.from(new Set(movs.map((m) => m.fecha))).sort().reverse();
  const porDia = dias.map((f) => ({
    f,
    total: movs.filter((m) => m.fecha === f).length,
    listos: movs.filter((m) => m.fecha === f && m.etapaNueva === 'listo').length,
    enviadas: movs.filter((m) => m.fecha === f && m.etapaNueva === 'enviado').length,
  }));

  return (
    <div>
      <PageHeader title="Métricas del pipeline" subtitle="Carga actual, producción de la semana y puntos del día" />
      <div className="space-y-5">
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1.5 text-cuerpo text-muted transition-colors duration-150 hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al kanban
        </Link>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatBox index={0} label="En proceso" valor={enProceso} sub="prendas en taller" tone="navy" />
          <StatBox index={1} label="Listas p/ envío" valor={listas} sub="esperan despacho" tone="gold" />
          <StatBox index={2} label="En camino" valor={enCamino} sub="por confirmar en tienda" tone="navy" />
          <StatBox index={3} label="Movimientos hoy" valor={movsHoy} sub="avances de etapa" tone="exito" />
          <StatBox index={4} label="Puntos hoy" valor={ptsHoy} sub="todo el equipo" tone="gold" />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {/* ── Carga por etapa ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <Gauge className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
                Dónde está la carga hoy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {porEtapa.map((e) => (
                <div key={e.k} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-cuerpo text-ink">{e.n}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-r-pastilla bg-navy/5">
                    <div
                      className="h-full rounded-r-pastilla bg-navy/70"
                      style={{ width: `${Math.max(4, Math.round((e.c / maxEtapa) * 100))}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-dato font-semibold text-navy">{e.c}</span>
                </div>
              ))}
              {porEtapa.length === 0 && <p className="text-cuerpo text-muted">Sin prendas en el tablero.</p>}
            </CardContent>
          </Card>

          {/* ── Ranking del día ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <Trophy className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden />
                Puntos del día por operario
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0 pb-0">
              {ranking.length === 0 ? (
                <EmptyState icon={Trophy} titulo="Todavía no se registraron puntos hoy" compacto>
                  Los puntos salen de avanzar prendas en el pipeline: cada pasada suma los suyos al
                  operario que la hizo.
                </EmptyState>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="pl-5">#</TH>
                      <TH>Operario</TH>
                      <TH className="text-right">Acciones</TH>
                      <TH className="pr-5 text-right">Puntos</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ranking.map((r, i) => (
                      <TR key={r.nombre}>
                        <TD className="pl-5 tabular-nums text-dato text-muted">{i + 1}</TD>
                        <TD className="text-cuerpo font-medium text-ink">{r.nombre}</TD>
                        <TD className="text-right tabular-nums text-dato text-muted">{r.acciones}</TD>
                        <TD className="pr-5 text-right tabular-nums text-dato font-bold text-gold-deep">
                          <span className="inline-flex items-center gap-1">
                            <Zap className="h-3 w-3" strokeWidth={2.5} /> {r.total}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Producción de la semana ── */}
        <Card>
          <CardHeader>
            <CardTitle>Producción de los últimos 7 días</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            {porDia.length === 0 ? (
              <p className="px-5 pb-5 text-cuerpo text-muted">Sin movimientos en la semana.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Día</TH>
                    <TH className="text-right">Avances de etapa</TH>
                    <TH className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <PackageCheck className="h-3 w-3" strokeWidth={2} /> Quedaron listas
                      </span>
                    </TH>
                    <TH className="pr-5 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Send className="h-3 w-3" strokeWidth={2} /> Despachadas
                      </span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {porDia.map((d) => (
                    <TR key={d.f}>
                      <TD className="pl-5 text-cuerpo capitalize text-ink">{diaLabel(d.f)}</TD>
                      <TD className="text-right tabular-nums text-dato text-navy">{d.total}</TD>
                      <TD className="text-right tabular-nums text-dato text-muted">{d.listos}</TD>
                      <TD className="pr-5 text-right tabular-nums text-dato text-muted">{d.enviadas}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
