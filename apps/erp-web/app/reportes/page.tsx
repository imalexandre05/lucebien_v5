import { listarReportes } from '../../lib/reportes-repo';
import { PageHeader } from '../../components/shell/page-header';
import { ReportesLista } from './lista';

export default async function ReportesPage() {
  const reportes = await listarReportes();
  const conContenido = reportes.filter((r) => !r.noEvaluable).length;
  return (
    <div>
      <PageHeader
        title="Reportes FR-01"
        subtitle={`${conContenido} con contenido · ${reportes.length} en total`}
      />
      <ReportesLista reportes={reportes} />
    </div>
  );
}
