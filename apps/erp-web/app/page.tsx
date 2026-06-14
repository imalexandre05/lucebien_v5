import Link from 'next/link';
import { Package, Contact, Shirt, TrendingUp } from 'lucide-react';
import { ETAPAS_PIPELINE, type EstadoActivo } from '@scilb/core';
import { inventarioRepo } from '../lib/inventario-repo';
import { clientesRepo } from '../lib/clientes-repo';
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

// Conteos de muestra del pipeline (se conecta al pipeline real en integración).
const PIPELINE_SAMPLE = [6, 4, 3, 2, 1, 2, 3, 1, 2];

export default async function Dashboard() {
  const [activos, clientes] = await Promise.all([inventarioRepo.listar(), clientesRepo.listar()]);
  const disponibles = activos.filter((a) => a.estado === 'disponible').length;
  const alquilados = activos.filter((a) => a.estado === 'alquilado').length;

  const kpis = [
    { label: 'Activos en inventario', value: activos.length, icon: Package, hint: `${disponibles} disponibles` },
    { label: 'En alquiler', value: alquilados, icon: TrendingUp, hint: 'fuera de tienda' },
    { label: 'Clientes', value: clientes.length, icon: Contact, hint: 'registrados' },
    { label: 'Etapas de pipeline', value: ETAPAS_PIPELINE.length, icon: Shirt, hint: 'lavandería' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen operativo · demo Fase 1" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">{k.label}</span>
                  <Icon className="h-4 w-4 text-gold" strokeWidth={1.75} />
                </div>
                <div className="mt-3 font-mono text-3xl font-semibold text-navy">{k.value}</div>
                <div className="mt-1 text-xs text-muted">{k.hint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Inventario reciente</CardTitle>
            <Link href="/inventario" className="text-xs font-medium text-navy hover:text-gold">
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
                  <TR key={a.id}>
                    <TD className="pl-5 font-mono font-medium text-navy">{a.codigo}</TD>
                    <TD>{a.tipo}</TD>
                    <TD>{a.sedeCod}</TD>
                    <TD>
                      <Badge tone={TONE[a.estado]}>{a.estado.replace('_', ' ')}</Badge>
                    </TD>
                    <TD className="pr-5 text-right font-mono">S/ {a.precioAlquiler.toFixed(2)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline de lavandería</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {ETAPAS_PIPELINE.map((e, i) => (
              <div key={e} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs capitalize text-muted">{e.replace('_', ' ')}</span>
                <div className="h-2 flex-1 rounded-full bg-paper">
                  <div
                    className="h-2 rounded-full bg-navy"
                    style={{ width: `${Math.min(100, PIPELINE_SAMPLE[i] * 14)}%` }}
                  />
                </div>
                <span className="w-4 text-right font-mono text-xs text-navy">{PIPELINE_SAMPLE[i]}</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted">Datos de muestra — pipeline real en integración.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
