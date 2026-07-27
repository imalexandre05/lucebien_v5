import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarReportes } from '../../lib/reportes-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { ReportesLista } from './lista';

// Gate server-side (Fase 1): antes el permiso 'reportes'.'ver' solo ocultaba el ítem del sidebar
// — cualquiera con la URL entraba igual a la lista completa de todas las sedes.
export default async function ReportesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'reportes', 'ver', sesion.usuario.rolCod)) redirect('/reportes/nuevo');

  const reportes = await listarReportes();
  const conContenido = reportes.filter((r) => !r.noEvaluable).length;
  return (
    <div>
      <PageHeader
        title="Reporte de Actividades"
        subtitle={`${conContenido} con contenido · ${reportes.length} en total`}
        action={
          <Link href="/reportes/nuevo" className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo reporte
          </Link>
        }
      />
      <ReportesLista reportes={reportes} />
    </div>
  );
}
