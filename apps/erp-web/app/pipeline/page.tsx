import { listarPasadas, rankingHoy } from '../../lib/pipeline-repo';
import { getSesion } from '../../lib/auth';
import { listarSedes } from '../../lib/sedes-repo';
import { equipoCompartido } from '../../lib/pipeline-operador';
import { RealtimeRefresh } from './realtime';
import { TableroPipeline } from './tablero';

export default async function PipelinePage() {
  const [pasadas, ranking, sesion, sedes, compartido] = await Promise.all([
    listarPasadas(),
    rankingHoy(),
    getSesion(),
    listarSedes().catch(() => []),
    equipoCompartido().catch(() => false),
  ]);
  // Destinos de despacho: las sedes de perfil 'pos' del catálogo (una sede nueva aparece sola).
  const tiendas = sedes.filter((s) => s.perfil !== 'almacen').map((s) => s.cod);

  return (
    <div>
      <RealtimeRefresh />
      <TableroPipeline
        pasadas={pasadas}
        ranking={ranking}
        operario={sesion?.nombre ?? ''}
        compartido={compartido}
        tiendas={tiendas.length ? tiendas : ['LB', 'ST', 'TR']}
      />
    </div>
  );
}
