import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { EstadoActivo } from '@scilb/core';
import { inventarioRepo } from '../../lib/inventario-repo';
import { eliminarActivo } from './actions';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';

const TONE: Record<EstadoActivo, Tone> = {
  disponible: 'green',
  alquilado: 'amber',
  en_lavanderia: 'navy',
  baja: 'gray',
};
const LABEL: Record<EstadoActivo, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  en_lavanderia: 'En lavandería',
  baja: 'Baja',
};

export default async function InventarioPage() {
  const activos = await inventarioRepo.listar();
  return (
    <div>
      <PageHeader
        title="Inventario comercial"
        subtitle="Activos de alquiler y venta"
        action={
          <Link href="/inventario/nuevo" className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo activo
          </Link>
        }
      />
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Código</TH>
                <TH>Tipo</TH>
                <TH>Talla</TH>
                <TH>Color</TH>
                <TH>Sede</TH>
                <TH>Estado</TH>
                <TH className="text-right">Alquiler</TH>
                <TH className="text-right">Venta</TH>
                <TH className="text-right">Usos</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {activos.map((a) => (
                <TR key={a.id}>
                  <TD className="pl-5 font-mono font-medium text-navy">{a.codigo}</TD>
                  <TD>{a.tipo}</TD>
                  <TD>{a.talla}</TD>
                  <TD>{a.color}</TD>
                  <TD>{a.sedeCod}</TD>
                  <TD>
                    <Badge tone={TONE[a.estado]}>{LABEL[a.estado]}</Badge>
                  </TD>
                  <TD className="text-right font-mono">S/ {a.precioAlquiler.toFixed(2)}</TD>
                  <TD className="text-right font-mono">S/ {a.precioVenta.toFixed(2)}</TD>
                  <TD className="text-right font-mono">{a.usosAcumulados}</TD>
                  <TD className="pr-5 text-right">
                    <form action={eliminarActivo}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-xs text-muted hover:text-gold">Baja</button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Precio sugerido por uso acumulado (E3): el modelo ya guarda <span className="font-mono">usosAcumulados</span>;
        la regla numérica se aplica al confirmarse.
      </p>
    </div>
  );
}
