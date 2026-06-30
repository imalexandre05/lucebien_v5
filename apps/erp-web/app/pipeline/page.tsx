import { listarPasadas, rankingHoy } from '../../lib/pipeline-repo';
import { getSesion } from '../../lib/auth';
import { RealtimeRefresh } from './realtime';
import { TableroPipeline } from './tablero';

export default async function PipelinePage() {
  const [pasadas, ranking, sesion] = await Promise.all([listarPasadas(), rankingHoy(), getSesion()]);

  return (
    <div>
      <RealtimeRefresh />
      <TableroPipeline pasadas={pasadas} ranking={ranking} operario={sesion?.nombre ?? ''} />
    </div>
  );
}
