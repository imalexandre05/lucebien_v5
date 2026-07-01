import Link from 'next/link';
import { Package, Shirt, ClipboardList, AlertTriangle } from 'lucide-react';
import { ETAPAS_PIPELINE, type EstadoActivo } from '@scilb/core';
import { inventarioRepo } from '../lib/inventario-repo';
import { listarPasadas } from '../lib/pipeline-repo';
import { getServerClient } from '../lib/supabase/server';
import { PageHeader } from '../components/shell/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge, type Tone } from '../components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table';

const TONE: Record<EstadoActivo, Tone> = {
  disponible: 'green',
  alquilado: 'amber',
  en_lavanderia: 'navy',
  baja: 'gray',
};

async function contar(tabla: string): Promise<number> {
  const sb = getServerClient();
  const { count } = await sb.from(tabla).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

export default async function Dashboard() {
  const [activos, pasadas, reportesCount, incidenciasCount] = await Promise.all([
    inventarioRepo.listar(),
    listarPasadas(),
    contar('reportes'),
    contar('incidencias'),
  ]);

  const disponibles = activos.filter((a) => a.estado === 'disponible').length;

  // Distribución real del pipeline por etapa.
  const porEtapa = new Map<string, number>();
  for (const p of pasadas) porEtapa.set(p.etapa, (porEtapa.get(p.etapa) ?? 0) + 1);
  const maxEtapa = Math.max(1, ...ETAPAS_PIPELINE.map((e) => porEtapa.get(e) ?? 0));

  const kpis = [
    { label: 'Prendas en pipeline', value: pasadas.length, icon: Shirt, hint: 'lavandería', href: '/pipeline' },
    { label: 'Reportes FR-01', value: reportesCount, icon: ClipboardList, hint: 'registrados', href: '/reportes' },
    { label: 'Incidencias', value: incidenciasCount, icon: AlertTriangle, hint: 'registradas', href: '/incidencias' },
    { label: 'Activos en inventario', value: activos.length, icon: Package, hint: `${disponibles} disponibles`, href: '/inventario' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen operativo" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Link
              key={k.label}
              href={k.href}
              className="animate-rise transition-[transform,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Card className="hover:shadow-lift">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">{k.label}</span>
                    <Icon className="h-4 w-4 text-gold" strokeWidth={1.75} />
                  </div>
                  <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-navy">{k.value}</div>
                  <div className="mt-1 text-xs text-muted">{k.hint}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Inventario reciente</CardTitle>
            <Link href="/inventario" className="text-xs font-medium text-navy transition-colors duration-150 hover:text-gold">
              Ver todo →
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-1">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Código</TH>
                  <TH>Tipo</TH>
                  <TH>Sede</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Alquiler</TH>
                </TR>
              </THead>
              <TBody>
                {activos.slice(0, 5).map((a) => (
                  <TR key={a.id} className="transition-colors duration-150">
                    <TD className="pl-5 font-mono font-medium text-navy">{a.codigo}</TD>
                    <TD>{a.tipo}</TD>
                    <TD>{a.sedeCod}</TD>
                    <TD>
                      <Badge tone={TONE[a.estado]}>{a.estado.replace('_', ' ')}</Badge>
                    </TD>
                    <TD className="pr-5 text-right font-mono tabular-nums">S/ {a.precioAlquiler.toFixed(2)}</TD>
                  </TR>
                ))}
                {activos.length === 0 && (
                  <TR>
                    <TD className="px-5 py-6 text-center text-muted" colSpan={5}>
                      Sin activos cargados.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline de lavandería</CardTitle>
            <Link href="/pipeline" className="text-xs font-medium text-navy transition-colors duration-150 hover:text-gold">
              Ver →
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {ETAPAS_PIPELINE.map((e) => {
              const n = porEtapa.get(e) ?? 0;
              return (
                <div key={e} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs capitalize text-muted">{e.replace('_', ' ')}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-navy transition-[width] duration-500 ease-out-expo"
                      style={{ width: `${(n / maxEtapa) * 100}%` }}
                    />
                  </div>
                  <span className="w-4 text-right font-mono text-xs tabular-nums text-navy">{n}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
