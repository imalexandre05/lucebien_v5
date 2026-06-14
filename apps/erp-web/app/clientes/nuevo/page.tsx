import Link from 'next/link';
import { crearCliente } from '../actions';
import { PageHeader } from '../../../components/shell/page-header';
import { Card, CardContent } from '../../../components/ui/card';
import { Input, Label } from '../../../components/ui/form';
import { Button, buttonVariants } from '../../../components/ui/button';

export default function NuevoClientePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nuevo cliente" subtitle="Registro de cliente y medidas" />
      <Card>
        <CardContent className="pt-5">
          <form action={crearCliente} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre completo</Label>
              <Input name="nombre" placeholder="Nombre y apellidos" required />
            </div>
            <div>
              <Label>DNI</Label>
              <Input name="dni" placeholder="8 dígitos" className="font-mono" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input name="telefono" placeholder="9 dígitos" className="font-mono" />
            </div>
            <div>
              <Label>Sede</Label>
              <Input name="sedeCod" placeholder="LB, ST, TR, AL" required />
            </div>
            <div>
              <Label>Talla</Label>
              <Input name="talla" placeholder="40 / M" />
            </div>
            <div className="mt-2 flex gap-3 sm:col-span-2">
              <Button type="submit">Guardar cliente</Button>
              <Link href="/clientes" className={buttonVariants({ variant: 'ghost' })}>
                Cancelar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
