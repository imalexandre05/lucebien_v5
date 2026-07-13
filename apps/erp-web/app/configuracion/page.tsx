import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Map, Building2 } from 'lucide-react';
import { listarConfig } from '../../lib/config-repo';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { ConfigCliente } from './cliente';

export default async function ConfiguracionPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const items = await listarConfig();
  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Parámetros del sistema · editables"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/configuracion/actividades" className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} /> Actividades
            </Link>
            <Link href="/configuracion/sedes" className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
              <Building2 className="h-3.5 w-3.5" strokeWidth={2} /> Sedes
            </Link>
            <Link href="/configuracion/layout" className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
              <Map className="h-3.5 w-3.5" strokeWidth={2} /> Layout
            </Link>
          </div>
        }
      />
      <ConfigCliente items={items} />
    </div>
  );
}
