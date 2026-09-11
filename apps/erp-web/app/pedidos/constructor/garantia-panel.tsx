'use client';

import type { TipoGarantia } from '@scilb/core';
import { OpcionBotones } from '../../../components/ui/opcion-botones';
import { MontoInput } from '../../../components/ui/monto-input';

export type GarantiaSel = {
  tipo: TipoGarantia;
  monto: number;
  documentoTipo: string;
  documentoNum: string;
};

export const GARANTIA_VACIA: GarantiaSel = { tipo: 'ninguna', monto: 0, documentoTipo: '', documentoNum: '' };

const TIPO_OPCIONES: { value: TipoGarantia; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'documento', label: 'Documento' },
  { value: 'ninguna', label: 'Ninguna' },
];

// DNI/carnet/licencia/otro: clasificación genérica de documento de identidad retenido en mostrador
// mientras dura el alquiler. Fase 10: configurable desde `config` (`pos_doc_garantia`, ver
// lib/pos-config.ts) — este default queda como fallback si la página no manda `docOpciones`.
const DOC_OPCIONES = [
  { value: 'dni', label: 'DNI' },
  { value: 'carnet', label: 'Carnet ext.' },
  { value: 'licencia', label: 'Licencia' },
  { value: 'otro', label: 'Otro' },
];

// ④ GARANTÍA — efectivo (monto retenido) | documento (retenido físicamente, sin monto) | ninguna.
export function GarantiaPanel({
  value,
  onChange,
  docOpciones,
}: {
  value: GarantiaSel;
  onChange: (v: GarantiaSel) => void;
  docOpciones?: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <label className="mb-1 block text-rotulo uppercase text-muted">Garantía</label>
        <OpcionBotones
          opciones={TIPO_OPCIONES}
          value={value.tipo}
          onChange={(tipo) => onChange({ ...value, tipo })}
          ariaLabel="Tipo de garantía"
        />
      </div>

      {value.tipo === 'efectivo' && (
        <MontoInput value={value.monto} onChange={(monto) => onChange({ ...value, monto })} label="Monto retenido" testId="garantia-monto" />
      )}

      {value.tipo === 'documento' && (
        <div className="space-y-2">
          <OpcionBotones
            opciones={docOpciones ?? DOC_OPCIONES}
            value={value.documentoTipo}
            onChange={(documentoTipo) => onChange({ ...value, documentoTipo })}
            ariaLabel="Tipo de documento"
          />
          <input
            value={value.documentoNum}
            onChange={(e) => onChange({ ...value, documentoNum: e.target.value })}
            placeholder="Número de documento"
            data-testid="garantia-documento-num"
            className="w-full rounded-r-chico border border-line bg-white px-2.5 py-2 text-cuerpo text-navy outline-none transition-colors focus:border-gold"
          />
        </div>
      )}
    </div>
  );
}
