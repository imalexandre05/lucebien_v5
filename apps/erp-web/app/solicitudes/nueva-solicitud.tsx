'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, X, ClipboardList } from 'lucide-react';
import {
  resolverOpciones,
  requiereCampo,
  URGENCIAS_SOLICITUD,
  type UrgenciaSolicitud,
  type CategoriaItemSolicitud,
} from '@scilb/core';
import { accionCrearSolicitud } from './actions';
import { URGENCIA_LABEL } from './constantes';
import type { ItemSolicitudInput } from '../../lib/solicitudes-repo';
import type { ColorSolicitud, ArticuloSolicitud, TipoPrendaSolicitud } from '../../lib/solicitud-catalogos-repo';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/cn';

// Formulario de alta (Fase 11). Portado de suAdd/suFields/suEnviar en public/js/solicitudes.js —
// misma estructura (categoría prenda/artículo, campos dinámicos por tipo), reescrito en React con
// los primitivos del ERP nuevo. `mtela`+`mprenda` del catálogo viejo se combinan en el único campo
// `modelo` de solicitud_items (la migración 0056 no separa columnas para cada uno — el sistema
// viejo hacía exactamente lo mismo en suEnviar: `item.modelo=[mt,mp].filter(Boolean).join(' | ')`).
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-2 text-sm text-navy outline-none transition-colors focus:border-gold';

const OPC_URGENCIA = URGENCIAS_SOLICITUD.map((u) => ({ value: u, label: URGENCIA_LABEL[u] }));

type ItemDraft = {
  key: string;
  categoria: CategoriaItemSolicitud;
  tipo: string;
  cantidad: number;
  color: string;
  talla: string;
  tela: string;
  mtela: string;
  mprendaModelo: string;
  detalle: string;
  obs: string;
};

function nuevaFila(categoria: CategoriaItemSolicitud, tipo: string): ItemDraft {
  return { key: '', categoria, tipo, cantidad: 1, color: '', talla: '', tela: '', mtela: '', mprendaModelo: '', detalle: '', obs: '' };
}

function validarItems(rows: ItemDraft[], tiposPrenda: TipoPrendaSolicitud[]): string | null {
  if (rows.length === 0) return 'Agrega al menos un ítem';
  for (const row of rows) {
    if (!row.tipo.trim()) return 'Cada ítem necesita un tipo';
    if (row.categoria === 'prenda' && tiposPrenda.length > 0) {
      const campos = tiposPrenda.find((t) => t.nombre === row.tipo)?.camposSolicitud;
      if (requiereCampo(campos?.color) && !row.color) return `Elige el color de "${row.tipo}"`;
      if (requiereCampo(campos?.talla) && !row.talla) return `Elige la talla de "${row.tipo}"`;
    }
  }
  return null;
}

function aItemInput(row: ItemDraft): ItemSolicitudInput {
  if (row.categoria === 'articulo') {
    return { categoria: 'articulo', tipo: row.tipo.trim(), cantidad: row.cantidad, detalle: row.detalle.trim() || undefined };
  }
  const modelo = [row.mtela.trim(), row.mprendaModelo.trim()].filter(Boolean).join(' | ');
  return {
    categoria: 'prenda',
    tipo: row.tipo.trim(),
    cantidad: row.cantidad,
    color: row.color.trim() || undefined,
    talla: row.talla.trim() || undefined,
    tela: row.tela.trim() || undefined,
    modelo: modelo || undefined,
    detalle: row.detalle.trim() || undefined,
    obs: row.obs.trim() || undefined,
  };
}

function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-line bg-white px-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Menos"
        className="flex h-7 w-7 items-center justify-center text-navy transition-colors hover:text-gold"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        onFocus={(e) => e.target.select()}
        className="w-9 border-none bg-transparent text-center text-sm font-semibold text-navy outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Más"
        className="flex h-7 w-7 items-center justify-center text-navy transition-colors hover:text-gold"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function CampoOpciones({
  label,
  value,
  onChange,
  opciones,
  ancho = 'w-28',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  ancho?: string;
}) {
  if (opciones.length === 0) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className={cn(fieldCls, ancho)} />;
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldCls, ancho, 'cursor-pointer')}>
      <option value="">{label}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function FilaPrenda({
  row,
  tiposPrenda,
  colores,
  onChange,
  onRemove,
}: {
  row: ItemDraft;
  tiposPrenda: TipoPrendaSolicitud[];
  colores: ColorSolicitud[];
  onChange: (p: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  const sinCatalogo = tiposPrenda.length === 0;
  const campos = tiposPrenda.find((t) => t.nombre === row.tipo)?.camposSolicitud;
  const nombresColores = colores.map((c) => c.nombre);
  const dot = colores.find((c) => c.nombre === row.color)?.hex;

  function cambiarTipo(nombre: string) {
    onChange({ tipo: nombre, color: '', talla: '', tela: '', mtela: '', mprendaModelo: '', detalle: '' });
  }

  return (
    <div className="rounded-lg border border-line bg-paper/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Badge tone="navy">Prenda</Badge>
        <button type="button" onClick={onRemove} aria-label="Quitar ítem" className="text-muted transition-colors hover:text-error">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sinCatalogo ? (
          <input value={row.tipo} onChange={(e) => onChange({ tipo: e.target.value })} placeholder="Tipo de prenda" className={cn(fieldCls, 'w-36 font-medium')} />
        ) : (
          <select value={row.tipo} onChange={(e) => cambiarTipo(e.target.value)} className={cn(fieldCls, 'w-32 cursor-pointer font-medium')}>
            {tiposPrenda.map((t) => (
              <option key={t.cod} value={t.nombre}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
        <Stepper value={row.cantidad} onChange={(v) => onChange({ cantidad: v })} />

        {(sinCatalogo || requiereCampo(campos?.color)) && (
          <div className="relative inline-flex items-center">
            {dot && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-2 h-2.5 w-2.5 rounded-full border border-black/10"
                style={{ background: dot }}
              />
            )}
            <CampoOpciones
              label="Color"
              value={row.color}
              onChange={(v) => onChange({ color: v })}
              opciones={sinCatalogo ? nombresColores : resolverOpciones(campos?.color, nombresColores)}
              ancho={cn('w-28', dot && 'pl-6')}
            />
          </div>
        )}
        {(sinCatalogo || requiereCampo(campos?.talla)) && (
          <CampoOpciones label="Talla" value={row.talla} onChange={(v) => onChange({ talla: v })} opciones={sinCatalogo ? [] : resolverOpciones(campos?.talla, [])} ancho="w-20" />
        )}
        {(sinCatalogo || requiereCampo(campos?.tela)) && (
          <CampoOpciones label="Tela" value={row.tela} onChange={(v) => onChange({ tela: v })} opciones={sinCatalogo ? [] : resolverOpciones(campos?.tela, [])} ancho="w-32" />
        )}
        {requiereCampo(campos?.mtela) && (
          <CampoOpciones label="Mod. tela" value={row.mtela} onChange={(v) => onChange({ mtela: v })} opciones={resolverOpciones(campos?.mtela, [])} ancho="w-28" />
        )}
        {(sinCatalogo || requiereCampo(campos?.mprenda)) && (
          <CampoOpciones
            label="Modelo"
            value={row.mprendaModelo}
            onChange={(v) => onChange({ mprendaModelo: v })}
            opciones={sinCatalogo ? [] : resolverOpciones(campos?.mprenda, [])}
            ancho="w-28"
          />
        )}
        {campos?.desc && (
          <input value={row.detalle} onChange={(e) => onChange({ detalle: e.target.value })} placeholder="Describe…" className={cn(fieldCls, 'min-w-[10rem] flex-1')} />
        )}
      </div>
      <input
        value={row.obs}
        onChange={(e) => onChange({ obs: e.target.value })}
        placeholder="Observación del ítem (opcional)"
        className={cn(fieldCls, 'mt-2 w-full text-xs')}
      />
    </div>
  );
}

function FilaArticulo({
  row,
  grupos,
  onChange,
  onRemove,
}: {
  row: ItemDraft;
  grupos: [string, ArticuloSolicitud[]][];
  onChange: (p: Partial<ItemDraft>) => void;
  onRemove: () => void;
}) {
  const sinCatalogo = grupos.length === 0;
  return (
    <div className="rounded-lg border border-line bg-paper/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Badge tone="gold">Artículo</Badge>
        <button type="button" onClick={onRemove} aria-label="Quitar ítem" className="text-muted transition-colors hover:text-error">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sinCatalogo ? (
          <input value={row.tipo} onChange={(e) => onChange({ tipo: e.target.value })} placeholder="Artículo" className={cn(fieldCls, 'min-w-[10rem] flex-1')} />
        ) : (
          <select value={row.tipo} onChange={(e) => onChange({ tipo: e.target.value })} className={cn(fieldCls, 'min-w-[10rem] flex-1 cursor-pointer')}>
            {grupos.map(([cat, lista]) => (
              <optgroup key={cat} label={cat}>
                {lista.map((a) => (
                  <option key={a.nombre} value={a.nombre}>
                    {a.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <Stepper value={row.cantidad} onChange={(v) => onChange({ cantidad: v })} />
      </div>
      <input
        value={row.detalle}
        onChange={(e) => onChange({ detalle: e.target.value })}
        placeholder="Especificación (ej. color de trapo)"
        className={cn(fieldCls, 'mt-2 w-full text-xs')}
      />
    </div>
  );
}

export function NuevaSolicitudModal({
  open,
  onClose,
  colores,
  articulos,
  tiposPrenda,
}: {
  open: boolean;
  onClose: () => void;
  colores: ColorSolicitud[];
  articulos: ArticuloSolicitud[];
  tiposPrenda: TipoPrendaSolicitud[];
}) {
  const router = useRouter();
  const idRef = useRef(0);
  const [urgencia, setUrgencia] = useState<UrgenciaSolicitud>('media');
  const [obs, setObs] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const grupos: [string, ArticuloSolicitud[]][] = [];
  for (const a of articulos) {
    const g = grupos.find(([cat]) => cat === a.categoria);
    if (g) g[1].push(a);
    else grupos.push([a.categoria, [a]]);
  }

  function resetear() {
    setUrgencia('media');
    setObs('');
    setItems([]);
    setError('');
  }
  function cerrar() {
    if (pending) return;
    resetear();
    onClose();
  }

  function agregar(categoria: CategoriaItemSolicitud) {
    const tipoInicial = categoria === 'prenda' ? (tiposPrenda[0]?.nombre ?? '') : (articulos[0]?.nombre ?? '');
    const fila = { ...nuevaFila(categoria, tipoInicial), key: String(idRef.current++) };
    setItems((xs) => [...xs, fila]);
  }
  function quitar(key: string) {
    setItems((xs) => xs.filter((x) => x.key !== key));
  }
  function actualizar(key: string, patch: Partial<ItemDraft>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function enviar() {
    const msg = validarItems(items, tiposPrenda);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    startTransition(async () => {
      const r = await accionCrearSolicitud({ urgencia, obs, items: items.map(aItemInput) });
      if (!r.ok) {
        setError(r.error ?? 'No se pudo crear la solicitud');
        return;
      }
      resetear();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={cerrar} title="Nueva solicitud" subtitle="Tienda → almacén" icon={<ClipboardList className="h-5 w-5 text-gold" strokeWidth={1.75} />} size="xl">
      <ModalBody className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Urgencia</label>
            <OpcionBotones opciones={OPC_URGENCIA} value={urgencia} onChange={setUrgencia} ariaLabel="Urgencia" />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Observación</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: campaña escolar" className={cn(fieldCls, 'w-full')} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm font-semibold text-navy">Ítems del pedido</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => agregar('prenda')} className={cn(buttonVariants({ variant: 'outline' }), 'py-1.5 text-xs')}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Prenda
            </button>
            <button type="button" onClick={() => agregar('articulo')} className={cn(buttonVariants({ variant: 'outline' }), 'py-1.5 text-xs')}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Artículo
            </button>
          </div>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {items.map((row) =>
            row.categoria === 'prenda' ? (
              <FilaPrenda key={row.key} row={row} tiposPrenda={tiposPrenda} colores={colores} onChange={(p) => actualizar(row.key, p)} onRemove={() => quitar(row.key)} />
            ) : (
              <FilaArticulo key={row.key} row={row} grupos={grupos} onChange={(p) => actualizar(row.key, p)} onRemove={() => quitar(row.key)} />
            ),
          )}
          {items.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Agrega una prenda o un artículo.</p>}
        </div>

        {error && <p className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={cerrar} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
          Cancelar
        </button>
        <Button type="button" onClick={enviar} pending={pending} disabled={items.length === 0}>
          {pending ? 'Enviando…' : 'Enviar solicitud'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
