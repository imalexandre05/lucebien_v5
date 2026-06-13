import { theme } from '@scilb/adapter-lucebien';
import { ETAPAS_PIPELINE } from '@scilb/core';

export default function Home() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy">SCI-LB — ERP</h1>
      <p className="font-body text-gold">Plataforma unificada (demo · Fase 1).</p>
      <p className="mt-4 font-mono text-sm">
        Pipeline de lavandería: {ETAPAS_PIPELINE.length} etapas · marca {theme.colors.navy}/{theme.colors.gold}
      </p>
    </div>
  );
}
