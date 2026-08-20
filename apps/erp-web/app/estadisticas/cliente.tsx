'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Printer, TrendingUp, Trophy, AlertTriangle, ClipboardCheck, Package, ShoppingCart } from 'lucide-react';
import { participacion, type Rango } from '@scilb/core';
import type { Estadisticas } from '../../lib/estadisticas-repo';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { StatBox } from '../../components/ui/stat-box';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/cn';

const fieldCls = 'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-gold';
const soles = (n: number) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const entero = (n: number) => new Intl.NumberFormat('es-PE').format(Math.round(n));
const diaCorto = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
};

const NIVEL_TONE: Record<string, string> = {
  grave: 'text-red-600',
  moderada: 'text-amber-600',
  leve: 'text-muted',
};

export function EstadisticasCliente({ data, rango }: { data: Estadisticas; rango: Rango }) {
  const router = useRouter();
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);

  function aplicar(d = desde, h = hasta) {
    router.push(`/estadisticas?desde=${d}&hasta=${h}`);
  }
  function preset(dias: number) {
    const hoy = new Date();
    const h = hoy.toISOString().slice(0, 10);
    const d = new Date(hoy.getTime() - (dias - 1) * 86400000).toISOString().slice(0, 10);
    setDesde(d);
    setHasta(h);
    aplicar(d, h);
  }

  const k = useMemo(() => {
    const ingresos = data.ingresos.reduce((s, r) => s + r.ingresos, 0);
    const egresos = data.ingresos.reduce((s, r) => s + r.egresos, 0);
    return {
      ingresos,
      egresos,
      neto: Math.round((ingresos - egresos) * 100) / 100,
      pedidosN: data.pedidos.reduce((s, r) => s + r.n, 0),
      pedidosTotal: data.pedidos.reduce((s, r) => s + r.total, 0),
      puntos: Math.round(data.productividad.reduce((s, r) => s + r.puntos, 0) * 10) / 10,
      incidencias: data.incidencias.reduce((s, r) => s + r.n, 0),
    };
  }, [data]);

  const ingresosMax = Math.max(1, ...data.ingresos.map((r) => Math.max(r.ingresos, r.egresos)));
  const pedidosPorTipo = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of data.pedidos) acc[p.tipo] = (acc[p.tipo] ?? 0) + p.total;
    return participacion(acc);
  }, [data.pedidos]);
  const invMax = Math.max(1, ...data.inventario.map((r) => r.n));
  const productividad = data.productividad.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* ── Filtros ── */}
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} /> Periodo
          </span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={fieldCls} aria-label="Desde" />
          <span className="text-muted">→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={fieldCls} aria-label="Hasta" />
          <button type="button" onClick={() => aplicar()} className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white transition hover:bg-navy-deep">
            Aplicar
          </button>
          <div className="ml-1 flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => preset(d)} className="rounded-md border border-line px-2 py-1.5 text-xs text-navy transition hover:border-gold">
                {d} días
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-navy transition hover:border-gold">
            <Printer className="h-4 w-4" strokeWidth={1.75} /> Imprimir
          </button>
        </CardContent>
      </Card>

      <p className="hidden text-sm text-muted print:block">
        Periodo: {rango.desde} → {rango.hasta}
      </p>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox index={0} label="Ingresos" valor={soles(k.ingresos)} sub="caja del periodo" tone="exito" />
        <StatBox index={1} label="Neto" valor={soles(k.neto)} sub={`egresos ${soles(k.egresos)}`} tone="navy" />
        <StatBox index={2} label="Pedidos" valor={entero(k.pedidosN)} sub={soles(k.pedidosTotal)} tone="gold" />
        <StatBox index={3} label="Puntos producción" valor={entero(k.puntos)} sub={`${entero(k.incidencias)} incidencias`} tone="navy" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {/* ── Ingresos por día ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <TrendingUp className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Ingresos por día
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.ingresos.length === 0 ? (
              <p className="text-sm text-muted">Sin movimientos de caja en el periodo.</p>
            ) : (
              data.ingresos.map((r) => (
                <div key={r.fecha} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">{diaCorto(r.fecha)}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-navy/5">
                    <div className="h-full rounded bg-emerald-500/70" style={{ width: `${Math.max(3, Math.round((r.ingresos / ingresosMax) * 100))}%` }} />
                  </div>
                  <span className="w-24 text-right font-mono text-xs tabular-nums text-navy">{soles(r.ingresos)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Composición de pedidos ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <ShoppingCart className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Ventas por tipo de pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pedidosPorTipo.length === 0 || pedidosPorTipo.every((p) => p.total === 0) ? (
              <p className="text-sm text-muted">Sin pedidos en el periodo.</p>
            ) : (
              pedidosPorTipo.map((p) => (
                <div key={p.categoria} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm capitalize text-ink">{p.categoria}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-navy/5">
                    <div className="h-full rounded bg-navy/70" style={{ width: `${Math.max(3, p.pct)}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono text-xs tabular-nums text-muted">{p.pct}%</span>
                  <span className="w-24 text-right font-mono text-xs tabular-nums text-navy">{soles(p.total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Ranking de productividad ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Trophy className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Productividad del pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            {productividad.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Sin puntos registrados en el periodo.</p>
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
                  {productividad.map((r, i) => (
                    <TR key={r.empleadoId}>
                      <TD className="pl-5 font-mono text-xs text-muted">{i + 1}</TD>
                      <TD className="text-sm font-medium text-ink">{r.nombre}</TD>
                      <TD className="text-right font-mono text-sm tabular-nums text-muted">{entero(r.acciones)}</TD>
                      <TD className="pr-5 text-right font-mono text-sm font-bold tabular-nums text-gold-deep">{r.puntos}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Cumplimiento de reportes de actividades ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <ClipboardCheck className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Cumplimiento de reportes por sede
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            {data.fr01.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Sin reportes en el periodo.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Sede</TH>
                    <TH className="text-right">Reportes</TH>
                    <TH className="text-right">Actividades</TH>
                    <TH className="text-right">Cumplim.</TH>
                    <TH className="pr-5 text-right">Puntaje</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.fr01.map((r) => {
                    const pct = r.actTotal ? Math.round((r.actDone / r.actTotal) * 100) : 0;
                    return (
                      <TR key={r.sedeCod}>
                        <TD className="pl-5 font-mono text-sm font-semibold text-navy">{r.sedeCod}</TD>
                        <TD className="text-right font-mono text-sm tabular-nums text-muted">{r.reportes}</TD>
                        <TD className="text-right font-mono text-xs tabular-nums text-muted">{r.actDone}/{r.actTotal}</TD>
                        <TD className="text-right font-mono text-sm tabular-nums text-navy">{pct}%</TD>
                        <TD className="pr-5 text-right font-mono text-sm tabular-nums text-gold-deep">{r.puntajeProm ?? '—'}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Incidencias ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Incidencias por sede
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            {data.incidencias.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Sin incidencias en el periodo.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Sede</TH>
                    <TH>Nivel</TH>
                    <TH className="text-right">Cantidad</TH>
                    <TH className="pr-5 text-right">Penalidad</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.incidencias.map((r, i) => (
                    <TR key={`${r.sedeCod}-${r.nivel}-${i}`}>
                      <TD className="pl-5 font-mono text-sm font-semibold text-navy">{r.sedeCod}</TD>
                      <TD className={cn('text-sm capitalize', NIVEL_TONE[r.nivel] ?? 'text-ink')}>{r.nivel}</TD>
                      <TD className="text-right font-mono text-sm tabular-nums text-navy">{r.n}</TD>
                      <TD className="pr-5 text-right font-mono text-sm tabular-nums text-muted">{r.penalidad || '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Ocupación de inventario ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <Package className="h-4 w-4 text-gold" strokeWidth={1.75} aria-hidden /> Ocupación del inventario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.inventario.length === 0 ? (
              <p className="text-sm text-muted">Sin inventario registrado.</p>
            ) : (
              data.inventario.map((r) => (
                <div key={r.estado} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm capitalize text-ink">{r.estado}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-navy/5">
                    <div className="h-full rounded bg-gold/60" style={{ width: `${Math.max(3, Math.round((r.n / invMax) * 100))}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-sm tabular-nums text-navy">{r.n}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
