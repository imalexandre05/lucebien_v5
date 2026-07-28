import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { puede, type MatrizPermisos } from '@scilb/core';
import { listarReportes } from '../../../lib/reportes-repo';
import { getSesion } from '../../../lib/auth';
import { leerMatrizPermisos } from '../../../lib/permisos-repo';
import { PageHeader } from '../../../components/shell/page-header';
import { buttonVariants } from '../../../components/ui/button';
import { ReportesLista } from '../../reportes/lista';

// Fase 4 tarea 1: lista administrativa de reportes — antes vivía en /reportes, ahora tiene ruta y
// permiso propios ('reportes_admin', migración 0052) porque /reportes pasó a ser solo el
// formulario del turno para el usuario operativo. Reusa ReportesLista tal cual (app/reportes/
// lista.tsx no cambió): solo cambia dónde se monta.
export default async function AdministracionReportesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect('/login');
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'reportes_admin', 'ver', sesion.usuario.rolCod)) {
    redirect('/reportes/nuevo');
  }

  const reportes = await listarReportes();
  const conContenido = reportes.filter((r) => !r.noEvaluable).length;
  return (
    <div>
      <PageHeader
        title="Historial de reportes"
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
