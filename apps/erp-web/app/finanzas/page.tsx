import { totalPorTipoLinea } from '@scilb/core';
import { resumenFinanciero } from '../../lib/caja-repo';
import { pedidosRepo } from '../../lib/pedidos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { StatBox } from '../../components/ui/stat-box';

const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const CAT_LABEL: Record<string, string> = {
  cobro: 'Cobros',
  garantia: 'Garantías',
  gasto: 'Gastos',
  devolucion_garantia: 'Devol. garantía',
  otro: 'Otros',
};

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2 text-cuerpo last:border-0">
      <span className="capitalize text-muted">{label}</span>
      <span className="tabular-nums text-navy">{valor}</span>
    </div>
  );
}

export default async function FinanzasPage() {
  const [fin, pedidos] = await Promise.all([resumenFinanciero(), pedidosRepo.listar()]);
  // Fase 9: agrupar por LÍNEA (pedido_items.tipo), no por el tipo de cabecera — un pedido 'mixto'
  // (alquiler + venta en la misma visita, posible desde la Fase 8) no tiene un `p.tipo` que
  // encaje en ninguno de los 3 buckets de abajo y desaparecía del todo del resumen comercial.
  const porTipo = totalPorTipoLinea(pedidos.flatMap((p) => p.items));
  const comercial = [
    { label: 'Ventas', valor: porTipo.venta },
    { label: 'Alquiler', valor: porTipo.alquiler },
    { label: 'Servicios', valor: porTipo.servicio },
  ];

  const ingresosCat = Object.entries(fin.ingresosCat);
  const egresosCat = Object.entries(fin.egresosCat);

  return (
    <div>
      <PageHeader title="Finanzas" subtitle="Ingresos, egresos y reportes básicos (de caja)" />

      <div className="grid grid-cols-3 gap-3">
        <StatBox index={0} label="Ingresos" valor={soles(fin.ingresos)} tone="exito" />
        <StatBox index={1} label="Egresos" valor={soles(fin.egresos)} tone="error" />
        <StatBox index={2} label="Neto" valor={soles(fin.neto)} tone="navy" />
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
              <p className="py-2 text-cuerpo text-muted">Sin movimientos todavía.</p>
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

      <p className="mt-3 text-apoyo text-muted">
        Los ingresos/egresos provienen de los movimientos de caja; el comercial por tipo, de los pedidos.
      </p>
    </div>
  );
}
