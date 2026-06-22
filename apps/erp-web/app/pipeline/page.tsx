import { Trophy } from 'lucide-react';
import { listarPasadas, rankingHoy } from '../../lib/pipeline-repo';
import { PageHeader } from '../../components/shell/page-header';
import { RealtimeRefresh } from './realtime';
import { TableroPipeline } from './tablero';

export default async function PipelinePage() {
  const [pasadas, ranking] = await Promise.all([listarPasadas(), rankingHoy()]);

  return (
    <div>
      <PageHeader title="Pipeline de lavandería" subtitle={`${pasadas.length} prendas · Almacén Central`} />
      <RealtimeRefresh />
      {ranking.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Trophy className="h-4 w-4 text-gold" strokeWidth={2} /> Puntos de hoy
          </span>
          {ranking.map((r, i) => (
            <span key={r.nombre} className="inline-flex items-center gap-1.5 rounded-full bg-navy/5 px-2.5 py-1 text-xs">
              <span className="font-mono text-[10px] text-slate-400">#{i + 1}</span>
              <span className="font-medium text-navy">{r.nombre}</span>
              <span className="font-mono font-bold tabular-nums text-[#7a6e0e]">{r.total}</span>
            </span>
          ))}
        </div>
      )}
      <TableroPipeline pasadas={pasadas} />
    </div>
  );
}
