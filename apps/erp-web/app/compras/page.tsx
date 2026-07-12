import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getSesion } from '../../lib/auth';
import { listarCompras } from '../../lib/compras-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { ComprasCliente } from './cliente';

export const dynamic = 'force-dynamic';

export default async function ComprasPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');

  const compras = await listarCompras();
  const pendientes = compras.filter((c) => c.estado === 'pendiente').length;

  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle={`${compras.length} registradas${pendientes ? ` · ${pendientes} por recibir` : ''}`}
        action={
          <Link href="/compras/nueva" className={cn(buttonVariants({ variant: 'primary' }))}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nueva compra
          </Link>
        }
      />
      <ComprasCliente compras={compras} />
    </div>
  );
}
