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
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        En vivo — el tablero se actualiza solo
      </div>
      <TableroPipeline pasadas={pasadas} />
    </div>
  );
}
