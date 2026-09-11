'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Filter, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { stockBajo } from '@scilb/core';
import type { Material, MaterialInput } from '../../lib/materiales-repo';
import { guardarMaterial, ajustarStockAction } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const fieldCls = campoCls;

const nfmt = (n: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(n);

export function MaterialesCliente({
  materiales,
  sedes,
  miSede,
  categorias,
  unidades,
}: {
  materiales: Material[];
  sedes: string[];
  miSede: string;
  categorias: string[];
  unidades: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fSede, setFSede] = useState('');
  const [soloBajos, setSoloBajos] = useState(false);
  const [editar, setEditar] = useState<Material | 'nuevo' | null>(null);
  const [ajustar, setAjustar] = useState<Material | null>(null);

  const cats = useMemo(
    () => [...new Set([...categorias, ...(materiales.map((m) => m.categoria).filter(Boolean) as string[])])],
    [categorias, materiales],
  );

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return materiales.filter((m) => {
      if (fSede && m.sedeCod !== fSede) return false;
      if (soloBajos && !stockBajo(m)) return false;
      if (needle && !m.nombre.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [materiales, q, fSede, soloBajos]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar material…"
            className={`${fieldCls} min-w-[12rem] flex-1`}
          />
          <select value={fSede} onChange={(e) => setFSede(e.target.value)} className={fieldCls} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {sedes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSoloBajos((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-apoyo transition',
              soloBajos ? 'border-error-line bg-error-soft text-error-deep' : 'border-line text-navy hover:border-gold',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} /> Bajo mínimo
          </button>
          <button
            type="button"
            onClick={() => setEditar('nuevo')}
            className={cn(buttonVariants({ variant: 'primary' }), 'ml-auto')}
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo material
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Material</TH>
                <TH>Categoría</TH>
                <TH>Sede</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Mínimo</TH>
                <TH className="text-right">Costo prom.</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtrados.map((m) => {
                const bajo = stockBajo(m);
                return (
                  <TR key={m.id} className={cn(!m.activo && 'opacity-60')}>
                    <TD className="pl-5">
                      <span className="font-medium text-navy">{m.nombre}</span>
                      {!m.activo && <span className="ml-2 text-apoyo text-muted">(inactivo)</span>}
                    </TD>
                    <TD className="text-cuerpo text-ink">{m.categoria || '—'}</TD>
                    <TD className="tabular-nums text-dato text-navy">{m.sedeCod}</TD>
                    <TD className="text-right">
                      <span className={cn('tabular-nums text-dato font-semibold', bajo ? 'text-error' : 'text-navy')}>
                        {nfmt(m.stockActual)}
                      </span>
                      <span className="ml-1 text-micro text-muted">{m.unidad}</span>
                      {bajo && (
                        <Badge tone="amber" className="ml-2">
                          bajo
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums text-dato text-muted">{nfmt(m.stockMinimo)}</TD>
                    <TD className="text-right tabular-nums text-dato text-muted">
                      {m.costoPromedio ? `S/ ${nfmt(m.costoPromedio)}` : '—'}
                    </TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAjustar(m)}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-apoyo text-navy transition hover:border-gold"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} /> Ajustar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditar(m)}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-apoyo text-navy transition hover:border-gold"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Editar
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    No hay materiales que coincidan.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {editar && (
        <MaterialModal
          material={editar === 'nuevo' ? null : editar}
          sedes={sedes}
          miSede={miSede}
          categorias={cats}
          unidades={unidades}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            router.refresh();
          }}
        />
      )}
      {ajustar && (
        <AjusteModal
          material={ajustar}
          onClose={() => setAjustar(null)}
          onSaved={() => {
            setAjustar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MaterialModal({
  material,
  sedes,
  miSede,
  categorias,
  unidades,
  onClose,
  onSaved,
}: {
  material: Material | null;
  sedes: string[];
  miSede: string;
  categorias: string[];
  unidades: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MaterialInput>(
    material
      ? {
          nombre: material.nombre,
          categoria: material.categoria,
          unidad: material.unidad,
          stockMinimo: material.stockMinimo,
          sedeCod: material.sedeCod,
          activo: material.activo,
        }
      : { nombre: '', categoria: '', unidad: unidades[0] ?? 'unidad', stockMinimo: 0, sedeCod: miSede || sedes[0] || '', activo: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof MaterialInput>(k: K, v: MaterialInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function guardar() {
    setError(null);
    startTransition(async () => {
      const err = await guardarMaterial(material?.id ?? null, form);
      if (err) setError(err);
      else onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} size="md" title={material ? material.nombre : 'Nuevo material'}>
      <ModalBody className="space-y-3">
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Nombre *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Categoría</label>
            <input value={form.categoria ?? ''} onChange={(e) => set('categoria', e.target.value)} list="cat-material" className={cn(fieldCls, 'w-full')} />
            <datalist id="cat-material">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Unidad</label>
            <select value={form.unidad} onChange={(e) => set('unidad', e.target.value)} className={cn(fieldCls, 'w-full')}>
              {unidades.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Sede</label>
            <select value={form.sedeCod} onChange={(e) => set('sedeCod', e.target.value)} className={cn(fieldCls, 'w-full')}>
              {sedes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Stock mínimo</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.stockMinimo}
              onChange={(e) => set('stockMinimo', Number(e.target.value))}
              className={cn(fieldCls, 'w-full')}
            />
          </div>
        </div>
        {!material && (
          <p className="text-apoyo text-muted">
            El stock inicial arranca en 0: cárgalo con una compra recibida o un ajuste de entrada.
          </p>
        )}
        <label className="flex items-center gap-2 text-cuerpo text-navy">
          <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
          Material activo
        </label>
        {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
          Cancelar
        </button>
        <Button type="button" onClick={guardar} pending={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function AjusteModal({ material, onClose, onSaved }: { material: Material; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'entrada' | 'salida' | 'ajuste'>('salida');
  const [cantidad, setCantidad] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resultante =
    tipo === 'entrada' ? material.stockActual + cantidad : tipo === 'salida' ? material.stockActual - cantidad : cantidad;

  function guardar() {
    setError(null);
    startTransition(async () => {
      const err = await ajustarStockAction({ materialId: material.id, tipo, cantidad, motivo });
      if (err) setError(err);
      else onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} size="sm" title={`Ajustar stock · ${material.nombre}`} subtitle={`Actual: ${material.stockActual} ${material.unidad}`}>
      <ModalBody className="space-y-3">
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={cn(fieldCls, 'w-full')}>
            <option value="salida">Salida (consumo / merma)</option>
            <option value="entrada">Entrada (ingreso manual)</option>
            <option value="ajuste">Ajuste (fijar el valor exacto)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Cantidad</label>
          <input type="number" min={0} step="0.01" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
        </div>
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. consumo en taller, merma…" className={cn(fieldCls, 'w-full')} />
        </div>
        <p className="rounded-md bg-navy/5 px-3 py-2 text-cuerpo text-navy">
          Stock resultante: <span className="tabular-nums font-semibold">{nfmt(resultante)}</span> {material.unidad}
        </p>
        {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
          Cancelar
        </button>
        <Button type="button" onClick={guardar} pending={pending}>
          {pending ? 'Aplicando…' : 'Aplicar ajuste'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
