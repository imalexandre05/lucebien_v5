import { ETAPAS_PIPELINE } from '@scilb/core';
import { listarPasadas } from '../../lib/pipeline-repo';
import { PageHeader } from '../../components/shell/page-header';
import { supabaseConfigurado } from '../../lib/supabase';

const NOMBRE: Record<string, string> = {
  recepcion: 'Recepción',
  lavado: 'Lavado',
  empatado: 'Empatado',
  vacio: 'Vacío',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Control calidad',
  listo: 'Listo p/ envío',
};

export default async function PipelinePage() {
  const pasadas = await listarPasadas();
  const conectado = supabaseConfigurado();

  return (
    <div>
      <PageHeader title="Pipeline de lavandería" subtitle="9 etapas · Almacén Central" />
      <div
        className={`mb-5 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
          conectado ? 'bg-emerald-600/10 text-emerald-700' : 'bg-gold/15 text-[#7a6e0e]'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${conectado ? 'bg-emerald-600' : 'bg-gold'}`} />
        {conectado ? 'En vivo desde Supabase · prenda_pasada' : 'Datos de muestra (sin Supabase)'} — los servicios crean pasadas acá.
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {ETAPAS_PIPELINE.map((e) => {
          const items = pasadas.filter((p) => p.etapa === e);
          return (
            <div key={e} className="w-44 shrink-0">
              <div className="mb-2 flex items-center justify-between rounded-md bg-navy px-3 py-2 text-paper">
                <span className="text-xs font-medium">{NOMBRE[e] ?? e}</span>
                <span className="font-mono text-xs text-gold">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border border-line bg-white px-3 py-2 shadow-card"
                  >
                    <div className="font-mono text-xs font-medium text-navy">{p.codigo}</div>
                    <div className="mt-0.5 text-[10px] text-muted">{p.sedeOrigenCod}</div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-line px-3 py-2 text-center text-[11px] text-muted">
                    vacío
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
