import Link from 'next/link';
import { Plus } from 'lucide-react';
import { clientesRepo } from '../../lib/clientes-repo';
import { eliminarCliente } from './actions';
import { PageHeader } from '../../components/shell/page-header';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { buttonVariants } from '../../components/ui/button';

export default async function ClientesPage() {
  const clientes = await clientesRepo.listar();
  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Datos personales y medidas"
        action={
          <Link href="/clientes/nuevo" className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo cliente
          </Link>
        }
      />
      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Nombre</TH>
                <TH>DNI</TH>
                <TH>Teléfono</TH>
                <TH>Sede</TH>
                <TH>Talla</TH>
                <TH>Alta</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {clientes.map((c) => (
                <TR key={c.id}>
                  <TD className="pl-5 font-medium text-navy">{c.nombre}</TD>
                  <TD className="font-mono">{c.dni || '—'}</TD>
                  <TD className="font-mono">{c.telefono || '—'}</TD>
                  <TD>{c.sedeCod}</TD>
                  <TD>{c.medidas.talla || '—'}</TD>
                  <TD className="font-mono text-muted">{c.createdAt}</TD>
                  <TD className="pr-5 text-right">
                    <form action={eliminarCliente}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-muted hover:text-gold">Eliminar</button>
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
