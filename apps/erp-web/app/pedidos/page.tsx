import { PageHeader } from '../../components/shell/page-header';
import { StubNote } from '../../components/shell/stub-note';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';

// Pedidos de muestra (alquiler / venta / servicio).
const PED = [
  { id: 1, cliente: 'Juan Pérez', tipo: 'alquiler', fecha: '2026-06-10', estado: 'abierto', total: 80 },
  { id: 2, cliente: 'María Quispe', tipo: 'venta', fecha: '2026-06-08', estado: 'cerrado', total: 450 },
  { id: 3, cliente: 'Luis Tarma', tipo: 'servicio', fecha: '2026-06-11', estado: 'en pipeline', total: 15 },
];

const TIPO_TONE: Record<string, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green' };

export default function PedidosPage() {
  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Alquiler · venta · servicios" />
      <StubNote>Módulo en construcción · datos de muestra. Un servicio crea una pasada en el pipeline interno.</StubNote>
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Tipo</TH>
                <TH>Fecha</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {PED.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5 font-medium text-navy">{p.cliente}</TD>
                  <TD>
                    <Badge tone={TIPO_TONE[p.tipo] ?? 'gray'}>{p.tipo}</Badge>
                  </TD>
                  <TD className="font-mono text-muted">{p.fecha}</TD>
                  <TD className="capitalize">{p.estado}</TD>
                  <TD className="pr-5 text-right font-mono">S/ {p.total.toFixed(2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
