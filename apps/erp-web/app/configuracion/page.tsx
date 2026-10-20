import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Map, Building2, Shield, Shirt, AlertOctagon, Bell, CalendarRange, Tag } from 'lucide-react';
import { listarConfig } from '../../lib/config-repo';
import { promedioPuntosUltimosDias } from '../../lib/evaluaciones-repo';
import { hoyPeru } from '../../lib/fechas';
import { getSesion } from '../../lib/auth';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { ConfigCliente } from './cliente';

export default async function ConfiguracionPage() {
  const sesion = await getSesion();
  const esAdmin = sesion?.usuario.rol === 'admin' || sesion?.usuario.rol === 'dueno';
  if (!esAdmin) redirect('/');

  const [items, promedio] = await Promise.all([listarConfig(), promedioPuntosUltimosDias(hoyPeru())]);
  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Parámetros del sistema · editables"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/configuracion/actividades" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} /> Actividades
            </Link>
            <Link href="/configuracion/tipos-producto" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Shirt className="h-3.5 w-3.5" strokeWidth={2} /> Tipos de producto
            </Link>
            <Link href="/configuracion/sedes" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Building2 className="h-3.5 w-3.5" strokeWidth={2} /> Sedes
            </Link>
            <Link href="/configuracion/lista-precios" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Tag className="h-3.5 w-3.5" strokeWidth={2} /> Lista de precios
            </Link>
            <Link href="/configuracion/temporadas" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} /> Temporadas
            </Link>
            <Link href="/configuracion/layout" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Map className="h-3.5 w-3.5" strokeWidth={2} /> Layout
            </Link>
            <Link href="/configuracion/permisos" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Shield className="h-3.5 w-3.5" strokeWidth={2} /> Permisos
            </Link>
            <Link href="/configuracion/tipos-incidencia" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <AlertOctagon className="h-3.5 w-3.5" strokeWidth={2} /> Tipos de incidencia
            </Link>
            <Link href="/configuracion/hora-limite" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} /> Hora límite de reportes
            </Link>
            <Link href="/configuracion/notificaciones" className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
              <Bell className="h-3.5 w-3.5" strokeWidth={2} /> Notificaciones
            </Link>
          </div>
        }
      />
      <ConfigCliente items={items} promedioPuntos={promedio} />
    </div>
  );
}
