'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TIPOS_LINEA, type ActivoInventario, type TipoLinea } from '@scilb/core';
import { ActivoPicker } from '../../../components/ui/activo-picker';
import { Badge } from '../../../components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { cn } from '../../../lib/cn';
import type { LineaLocal } from './constructor';

const TIPO_LABEL: Record<TipoLinea, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección' };
// Alt+1..4 (manejado por el padre) recorre este mismo orden — se muestra en el título del botón
// como recordatorio visual del atajo.
const TIPO_ATAJO: Record<TipoLinea, string> = { alquiler: 'Alt+1', venta: 'Alt+2', servicio: 'Alt+3', confeccion: 'Alt+4' };

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

// ② LÍNEAS — botones de tipo (definen el tipo de la PRÓXIMA línea, Alt+1..4) + buscador de activo
// (F2/Ctrl+K: escribir código + Enter agrega la línea con el precio sugerido) + tabla editable.
// Servicios/confección sin prenda física del catálogo se agregan por el formulario manual de abajo.
export function LineasPanel({
  activos,
  tipoActivo,
  onTipoActivoChange,
  items,
  onAdd,
  onRemove,
  onUpdate,
  activoInputRef,
}: {
  activos: ActivoInventario[];
  tipoActivo: TipoLinea;
  onTipoActivoChange: (t: TipoLinea) => void;
  items: LineaLocal[];
  onAdd: (l: LineaLocal) => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<LineaLocal>) => void;
  activoInputRef: React.RefObject<HTMLInputElement>;
}) {
  const [manualDesc, setManualDesc] = useState('');
  const [manualPrecio, setManualPrecio] = useState(0);

  const excluidos = new Set(items.map((i) => i.activoId).filter(Boolean) as string[]);

  function agregarActivo(a: ActivoInventario, precio: number) {
    onAdd({
      key: crypto.randomUUID(),
      tipo: tipoActivo,
      activoId: a.id,
      activoCodigo: a.codigo,
      descripcion: `${a.tipo} ${a.talla} · ${a.color}`.trim(),
      cantidad: 1,
      precioUnitario: precio,
      precioLista: precio,
      esCortesia: false,
      etapaConfeccion: tipoActivo === 'confeccion' ? 'corte' : undefined,
    });
  }
  function agregarManual() {
    if (!manualDesc.trim()) return;
    onAdd({
      key: crypto.randomUUID(),
      tipo: tipoActivo,
      descripcion: manualDesc.trim(),
      cantidad: 1,
      precioUnitario: manualPrecio,
      precioLista: manualPrecio,
      esCortesia: false,
      etapaConfeccion: tipoActivo === 'confeccion' ? 'corte' : undefined,
    });
    setManualDesc('');
    setManualPrecio(0);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo de la próxima línea</label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de línea" data-testid="tipo-linea-botones">
          {TIPOS_LINEA.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipoActivo === t}
              data-testid={`tipo-linea-${t}`}
              title={TIPO_ATAJO[t]}
              onClick={() => onTipoActivoChange(t)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                tipoActivo === t ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
              )}
            >
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Prenda / activo</label>
        <ActivoPicker
          activos={activos}
          tipo={tipoActivo}
          onSeleccionar={agregarActivo}
          excluidos={excluidos}
          inputRef={activoInputRef}
          testId="activo-picker-input"
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-line px-2.5 py-2">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Línea manual (sin prenda del catálogo)</label>
          <input
            value={manualDesc}
            onChange={(e) => setManualDesc(e.target.value)}
            placeholder="ej. Lavado en seco de saco del cliente"
            className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-gold"
          />
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          value={manualPrecio || ''}
          onChange={(e) => setManualPrecio(Number(e.target.value) || 0)}
          placeholder="S/ 0.00"
          className="w-28 rounded-md border border-line bg-white px-2.5 py-1.5 text-right tabular-nums text-sm text-navy outline-none focus:border-gold"
        />
        <button
          type="button"
          onClick={agregarManual}
          disabled={!manualDesc.trim()}
          className="toque inline-flex items-center gap-1 rounded-md border border-navy/25 px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
        </button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Tipo</TH>
            <TH>Prenda</TH>
            <TH className="text-center">Cant.</TH>
            <TH className="text-right">Precio</TH>
            <TH className="text-center">Cortesía</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {items.map((l) => (
            <TR key={l.key} data-testid="linea-fila">
              <TD>
                <Badge tone="navy">{TIPO_LABEL[l.tipo]}</Badge>
              </TD>
              <TD className="max-w-[16rem] truncate">
                {l.activoCodigo && <span className="mr-1.5 tabular-nums text-xs text-navy">{l.activoCodigo}</span>}
                <span className="text-xs text-muted">{l.descripcion || '—'}</span>
              </TD>
              <TD className="text-center">
                <input
                  type="number"
                  min="1"
                  value={l.cantidad}
                  onChange={(e) => onUpdate(l.key, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-14 rounded-md border border-line bg-white px-1.5 py-1 text-center tabular-nums text-xs text-navy outline-none focus:border-gold"
                />
              </TD>
              <TD className="text-right">
                {l.esCortesia ? (
                  <Badge tone="green">CORTESÍA</Badge>
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.precioUnitario}
                    onChange={(e) => onUpdate(l.key, { precioUnitario: Number(e.target.value) || 0 })}
                    className="w-24 rounded-md border border-line bg-white px-1.5 py-1 text-right tabular-nums text-xs text-navy outline-none focus:border-gold"
                  />
                )}
              </TD>
              <TD className="text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={l.esCortesia}
                  data-testid="linea-cortesia-toggle"
                  onClick={() => onUpdate(l.key, { esCortesia: !l.esCortesia })}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    l.esCortesia ? 'border-exito bg-exito/10 text-exito-deep' : 'border-line text-muted hover:border-gold',
                  )}
                >
                  {l.esCortesia ? 'Sí' : 'No'}
                </button>
              </TD>
              <TD>
                <button
                  type="button"
                  data-testid="linea-quitar"
                  onClick={() => onRemove(l.key)}
                  className="text-muted transition-colors hover:text-error"
                  aria-label="Quitar línea"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-xs text-muted">
                Sin líneas todavía — busca una prenda arriba o agrega una línea manual.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

export { soles };
