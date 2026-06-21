import { listarPasadas } from '../../lib/pipeline-repo';
import { PageHeader } from '../../components/shell/page-header';

// Columnas del tablero: las 8 etapas de trabajo (como el kanban del sistema viejo, sin
// 'vacio' que no se usa) + 'enviado' como columna terminal (prendas ya despachadas).
const COLUMNAS = [
  'recepcion',
  'lavado',
  'empatado',
  'refaccion',
  'compostura',
  'planchado',
  'control_calidad',
  'listo',
  'enviado',
] as const;

const NOMBRE: Record<string, string> = {
  recepcion: 'Recepción',
  lavado: 'Lavado',
  empatado: 'Empatado',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Control calidad',
  listo: 'Listo p/ envío',
  enviado: 'Enviadas',
};

export default async function PipelinePage() {
  const pasadas = await listarPasadas();
  const total = pasadas.length;

  return (
    <div>
      <PageHeader title="Pipeline de lavandería" subtitle={`${total} prendas · Almacén Central`} />

      <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-emerald-600/10 px-3 py-1.5 text-xs text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        En vivo desde Supabase · <span className="font-mono">prenda_pasada</span> (RLS por rol/sede)
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNAS.map((e) => {
          const items = pasadas.filter((p) => p.etapa === e);
          const terminal = e === 'enviado';
          return (
            <div key={e} className="w-48 shrink-0">
              <div
                className={`mb-2 flex items-center justify-between rounded-md px-3 py-2 ${
                  terminal ? 'bg-gold/20 text-[#7a6e0e]' : 'bg-navy text-paper'
                }`}
              >
                <span className="text-xs font-medium">{NOMBRE[e] ?? e}</span>
                <span className={`font-mono text-xs ${terminal ? 'text-[#7a6e0e]' : 'text-gold'}`}>
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <div key={p.id} className="rounded-md border border-line bg-white px-3 py-2 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-navy">{p.codigo}</span>
                      {Boolean(p.tipo) && <span className="text-[10px] text-muted">{p.tipo}</span>}
                    </div>
                    {Boolean(p.color || p.talla) && (
                      <div className="mt-0.5 text-[10px] text-muted">
                        {[p.color, p.talla].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-[9px] text-navy">
                        {p.sedeOrigenCod}
                      </span>
                      {Boolean(p.necesitaCompostura) && (
                        <span className="text-[9px] font-medium text-amber-700">compostura</span>
                      )}
                      {Boolean(p.aprobada) && (
                        <span className="text-[9px] font-medium text-emerald-700">aprobada</span>
                      )}
                    </div>
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

      <p className="mt-4 text-xs text-muted">
        Tablero de solo lectura por ahora. Avanzar / rechazar / dividir y el “en vivo” (Realtime)
        son los siguientes pasos.
      </p>
    </div>
  );
}
