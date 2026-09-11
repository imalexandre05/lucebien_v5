'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Pencil, Plus, Truck } from 'lucide-react';
import type { Proveedor, ProveedorInput } from '../../lib/proveedores-repo';
import { guardarProveedor } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const fieldCls = campoCls;

const vacio = (): ProveedorInput => ({
  nombre: '',
  ruc: '',
  contacto: '',
  telefono: '',
  direccion: '',
  categoria: '',
  activo: true,
  obs: '',
});

export function ProveedoresCliente({ proveedores, categorias }: { proveedores: Proveedor[]; categorias: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [editar, setEditar] = useState<Proveedor | 'nuevo' | null>(null);

  const cats = useMemo(
    () => [...new Set([...categorias, ...proveedores.map((p) => p.categoria).filter(Boolean) as string[]])],
    [categorias, proveedores],
  );

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return proveedores.filter((p) => {
      if (fCat && p.categoria !== fCat) return false;
      if (needle && !`${p.nombre} ${p.ruc ?? ''} ${p.contacto ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [proveedores, q, fCat]);

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
            placeholder="Buscar por nombre, RUC o contacto…"
            className={`${fieldCls} min-w-[14rem] flex-1`}
          />
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={fieldCls} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditar('nuevo')}
            className={cn(buttonVariants({ variant: 'primary' }), 'ml-auto')}
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo proveedor
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Proveedor</TH>
                <TH>Categoría</TH>
                <TH>Contacto</TH>
                <TH>Teléfono</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtrados.map((p) => (
                <TR key={p.id} className={cn(!p.activo && 'opacity-60')}>
                  <TD className="pl-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-pastilla bg-navy/5 text-navy">
                        <Truck className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-navy">{p.nombre}</div>
                        {Boolean(p.ruc) && <div className="tabular-nums text-micro text-muted">RUC {p.ruc}</div>}
                      </div>
                    </div>
                  </TD>
                  <TD className="text-cuerpo text-ink">{p.categoria || '—'}</TD>
                  <TD className="text-cuerpo text-ink">{p.contacto || '—'}</TD>
                  <TD className="tabular-nums text-dato">{p.telefono || '—'}</TD>
                  <TD>
                    {p.activo ? (
                      <Badge tone="green">Activo</Badge>
                    ) : (
                      <span className="text-apoyo text-muted">Inactivo</span>
                    )}
                  </TD>
                  <TD className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditar(p)}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-apoyo text-navy transition hover:border-gold"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Editar
                    </button>
                  </TD>
                </TR>
              ))}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={6}>
                    No hay proveedores que coincidan.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {editar && (
        <ProveedorModal
          proveedor={editar === 'nuevo' ? null : editar}
          categorias={cats}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ProveedorModal({
  proveedor,
  categorias,
  onClose,
  onSaved,
}: {
  proveedor: Proveedor | null;
  categorias: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProveedorInput>(proveedor ? { ...proveedor } : vacio());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ProveedorInput>(k: K, v: ProveedorInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function guardar() {
    setError(null);
    startTransition(async () => {
      const err = await guardarProveedor(proveedor?.id ?? null, form);
      if (err) setError(err);
      else onSaved();
    });
  }

  return (
    <Modal open onClose={onClose} size="md" title={proveedor ? proveedor.nombre : 'Nuevo proveedor'}>
      <ModalBody className="space-y-3">
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Nombre / razón social *</label>
          <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">RUC</label>
            <input value={form.ruc ?? ''} onChange={(e) => set('ruc', e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Categoría</label>
            <input
              value={form.categoria ?? ''}
              onChange={(e) => set('categoria', e.target.value)}
              list="cat-proveedor"
              className={cn(fieldCls, 'w-full')}
            />
            <datalist id="cat-proveedor">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Contacto</label>
            <input value={form.contacto ?? ''} onChange={(e) => set('contacto', e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
          <div>
            <label className="mb-1 block text-rotulo uppercase text-muted">Teléfono</label>
            <input value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} className={cn(fieldCls, 'w-full')} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Dirección</label>
          <input value={form.direccion ?? ''} onChange={(e) => set('direccion', e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
        <div>
          <label className="mb-1 block text-rotulo uppercase text-muted">Observación</label>
          <input value={form.obs ?? ''} onChange={(e) => set('obs', e.target.value)} className={cn(fieldCls, 'w-full')} />
        </div>
        <label className="flex items-center gap-2 text-cuerpo text-navy">
          <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
          Proveedor activo
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
