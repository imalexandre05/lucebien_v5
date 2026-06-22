import { listarPasadas } from '../../lib/pipeline-repo';
import { PageHeader } from '../../components/shell/page-header';
import { RealtimeRefresh } from './realtime';
import { TableroPipeline } from './tablero';

export default async function PipelinePage() {
  const pasadas = await listarPasadas();

  return (
    <div>
      <PageHeader title="Pipeline de lavandería" subtitle={`${pasadas.length} prendas · Almacén Central`} />
      <RealtimeRefresh />
      <TableroPipeline pasadas={pasadas} />
    </div>
  );
}
