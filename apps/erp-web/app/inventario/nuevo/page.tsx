import Link from 'next/link';
import { ESTADOS_ACTIVO } from '@scilb/core';
import { crearActivo } from '../actions';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Input, Select, Label } from '../../../components/ui/form';
import { Button, buttonVariants } from '../../../components/ui/button';

export default function NuevoActivoPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nuevo activo" subtitle="Alta de prenda de inventario" />
      <Card>
        <CardContent className="pt-5">
          <form action={crearActivo} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input name="codigo" placeholder="TN-042" className="font-mono" required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Input name="tipo" placeholder="TN, CM" required />
            </div>
            <div>
              <Label>Talla</Label>
              <Input name="talla" placeholder="40 / M" />
            </div>
            <div>
              <Label>Color</Label>
              <Input name="color" placeholder="Navy" />
            </div>
            <div>
              <Label>Sede</Label>
              <Input name="sedeCod" placeholder="LB, ST, TR, AL" required />
            </div>
            <div>
              <Label>Estado</Label>
              <Select name="estado" defaultValue="disponible">
                {ESTADOS_ACTIVO.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Precio base</Label>
              <Input name="precioBase" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <Label>Precio alquiler</Label>
              <Input name="precioAlquiler" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <Label>Precio venta</Label>
              <Input name="precioVenta" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <Label>Usos acumulados</Label>
              <Input name="usosAcumulados" type="number" placeholder="0" />
            </div>
            <div className="mt-2 flex gap-3 sm:col-span-2">
              <Button type="submit">Guardar activo</Button>
              <Link href="/inventario" className={buttonVariants({ variant: 'ghost' })}>
                Cancelar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
