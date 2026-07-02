import { resumenFinanciero } from '../../lib/caja-repo';
import { pedidosRepo } from '../../lib/pedidos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { cn } from '../../lib/cn';

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const CAT_LABEL: Record<string, string> = {
  cobro: 'Cobros',
  garantia: 'Garantías',
  gasto: 'Gastos',
  devolucion_garantia: 'Devol. garantía',
  otro: 'Otros',
};

function StatBox({ label, valor, tone }: { label: string; valor: string; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-2xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2 text-sm last:border-0">
      <span className="capitalize text-muted">{label}</span>
      <span className="font-mono tabular-nums text-navy">{valor}</span>
    </div>
  );
}

export default async function FinanzasPage() {
  const [fin, pedidos] = await Promise.all([resumenFinanciero(), pedidosRepo.listar()]);
  const porTipo = (t: string) => pedidos.filter((p) => p.tipo === t).reduce((s, p) => s + p.total, 0);
  const comercial = [
    { label: 'Ventas', valor: porTipo('venta') },
    { label: 'Alquiler', valor: porTipo('alquiler') },
    { label: 'Servicios', valor: porTipo('servicio') },
  ];

  const ingresosCat = Object.entries(fin.ingresosCat);
  const egresosCat = Object.entries(fin.egresosCat);

  return (
    <div>
      <PageHeader title="Finanzas" subtitle="Ingresos, egresos y reportes básicos (de caja)" />

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Ingresos" valor={soles(fin.ingresos)} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox label="Egresos" valor={soles(fin.egresos)} tone="border-red-200 bg-red-50 text-red-700" />
        <StatBox label="Neto" valor={soles(fin.neto)} tone="border-navy/15 bg-navy/5 text-navy" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ingresos por método</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <Fila label="Efectivo" valor={soles(fin.efectivo)} />
            <Fila label="Yape" valor={soles(fin.yape)} />
            <Fila label="Transferencia" valor={soles(fin.transferencia)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por categoría</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {ingresosCat.length === 0 && egresosCat.length === 0 && (
              <p className="py-2 text-sm text-muted">Sin movimientos todavía.</p>
            )}
            {ingresosCat.map(([cat, monto]) => (
              <Fila key={`i-${cat}`} label={`+ ${CAT_LABEL[cat] ?? cat}`} valor={soles(monto)} />
            ))}
            {egresosCat.map(([cat, monto]) => (
              <Fila key={`e-${cat}`} label={`− ${CAT_LABEL[cat] ?? cat}`} valor={soles(monto)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comercial por tipo</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {comercial.map((c) => (
              <Fila key={c.label} label={c.label} valor={soles(c.valor)} />
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="mt-3 text-xs text-muted">
        Los ingresos/egresos provienen de los movimientos de caja; el comercial por tipo, de los pedidos.
      </p>
    </div>
  );
}
