import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listarReportes } from '../../lib/reportes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { buttonVariants } from '../../components/ui/button';
import { ReportesLista } from './lista';

export default async function ReportesPage() {
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
