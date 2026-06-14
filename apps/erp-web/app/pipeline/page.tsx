import { ETAPAS_PIPELINE } from '@scilb/core';
import { PageHeader } from '../../components/shell/page-header';
import { StubNote } from '../../components/shell/stub-note';

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

// Prendas de muestra por etapa.
const SAMPLE: Record<string, string[]> = {
  recepcion: ['TN-014', 'CM-022'],
  lavado: ['TN-008'],
  empatado: ['TN-031'],
  vacio: [],
  refaccion: ['SC-005'],
  compostura: ['TN-019', 'PT-007'],
  planchado: ['TN-002'],
  control_calidad: ['CM-008'],
  listo: ['TN-042', 'TN-040'],
};

export default function PipelinePage() {
  return (
    <div>
      <PageHeader title="Pipeline de lavandería" subtitle="9 etapas · Almacén Central" />
      <StubNote>Módulo en construcción · datos de muestra. Se conecta al pipeline real (SSE/Realtime) en la integración.</StubNote>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {ETAPAS_PIPELINE.map((e) => {
          const prendas = SAMPLE[e] ?? [];
          return (
            <div key={e} className="w-44 shrink-0">
              <div className="mb-2 flex items-center justify-between rounded-md bg-navy px-3 py-2 text-paper">
                <span className="text-xs font-medium">{NOMBRE[e] ?? e}</span>
                <span className="font-mono text-xs text-gold">{prendas.length}</span>
              </div>
              <div className="space-y-2">
                {prendas.map((code) => (
                  <div
                    key={code}
                    className="rounded-md border border-line bg-white px-3 py-2 font-mono text-xs text-navy shadow-card"
                  >
                    {code}
                  </div>
                ))}
                {prendas.length === 0 && (
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
