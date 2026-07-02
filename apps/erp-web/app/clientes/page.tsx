import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listarClientesCRM } from '../../lib/crm-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { ClientesCRM } from './clientes-crm';

export default async function ClientesPage() {
  const clientes = await listarClientesCRM();
  return (
    <div>
      <PageHeader
        title="Clientes · CRM"
        subtitle="Historial, segmentación y seguimiento"
        action={
          <Link href="/clientes/nuevo" className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo cliente
          </Link>
        }
      />
      <ClientesCRM clientes={clientes} />
    </div>
  );
}
