'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { accionEliminarItemPrecio, accionGuardarItemPrecio } from './actions';
import type { CategoriaPrecio, ItemPrecio } from '../../../lib/lista-precios-repo';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

type Form = { id?: string; nombre: string; categoria: CategoriaPrecio; precio: string; activo: boolean };
const VACIO: Form = { nombre: '', categoria: 'prenda', precio: '', activo: true };
const soles = (v: number) => `S/ ${v.toFixed(2)}`;
const ETIQUETA: Record<CategoriaPrecio, string> = { prenda: 'Prenda', servicio: 'Servicio' };

export function ListaPreciosCliente({ items }: { items: ItemPrecio[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(VACIO);

  function abrir(i?: ItemPrecio) {
    setForm(i ? { id: i.id, nombre: i.nombre, categoria: i.categoria, precio: String(i.precio), activo: i.activo } : VACIO);
    setError('');
    setAbierto(true);
  }

  function guardar() {
    setError('');
    if (form.precio.trim() === '') return setError('Falta el precio.');
    startTransition(async () => {
      const r = await accionGuardarItemPrecio({
        id: form.id,
        nombre: form.nombre,
        categoria: form.categoria,
        precio: Number(form.precio),
        activo: form.activo,
      });
      if (!r.ok) return setError(r.error ?? 'Error');
      setAbierto(false);
      router.refresh();
    });
  }

  function alternar(i: ItemPrecio) {
    startTransition(async () => {
      const r = await accionGuardarItemPrecio({ ...i, activo: !i.activo });
      if (!r.ok) setError(r.error ?? 'Error');
      router.refresh();
    });
  }

  function quitar(i: ItemPrecio) {
    if (!window.confirm(`¿Quitar «${i.nombre}» de la lista? Si solo quieres que no se ofrezca, desactívalo.`)) return;
    startTransition(async () => {
      const r = await accionEliminarItemPrecio(i.id);
      if (!r.ok) setError(r.error ?? 'Error');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3.5">
          <p className="text-cuerpo text-muted">
            {items.length === 0
              ? 'Todavía no hay precios. Agrega el primero: ventas lo podrá elegir al armar una boleta.'
              : `${items.length} artículo(s). Los desactivados no se ofrecen en ventas.`}
          </p>
          <button type="button" onClick={() => abrir()} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo artículo
          </button>
        </CardContent>
      </Card>

      {error && !abierto && <Aviso tono="error">{error}</Aviso>}

      {items.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Artículo</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Precio</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((i) => (
                  <TR key={i.id}>
                    <TD className={cn('pl-5 font-medium', i.activo ? 'text-navy' : 'text-muted')}>{i.nombre}</TD>
                    <TD className="text-cuerpo text-muted">{ETIQUETA[i.categoria]}</TD>
                    <TD className="text-right tabular-nums">{soles(i.precio)}</TD>
                    <TD className="text-cuerpo text-muted">{i.activo ? 'Activo' : 'Desactivado'}</TD>
                    <TD className="pr-5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button type="button" onClick={() => abrir(i)} className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-navy hover:border-gold">
                          <Pencil className="h-3 w-3" strokeWidth={2} /> Editar
                        </button>
                        <button type="button" onClick={() => alternar(i)} disabled={pending} className="rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-navy hover:border-gold">
                          {i.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" onClick={() => quitar(i)} disabled={pending} className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-apoyo text-muted hover:border-gold">
                          <Trash2 className="h-3 w-3" strokeWidth={2} /> Quitar
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Modal
        open={abierto}
        onClose={() => !pending && setAbierto(false)}
        size="sm"
        title={form.id ? 'Editar artículo' : 'Nuevo artículo'}
        icon={<Tag className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />}
      >
        <ModalBody className="space-y-3">
          <div>
            <label htmlFor="lp-nombre" className="mb-1 block text-rotulo uppercase text-muted">Nombre *</label>
            <input id="lp-nombre" value={form.nombre} placeholder="Ej: Terno completo" onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={cn(campoCls, 'w-full')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lp-cat" className="mb-1 block text-rotulo uppercase text-muted">Tipo</label>
              <select id="lp-cat" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as CategoriaPrecio }))} className={cn(campoCls, 'w-full')}>
                <option value="prenda">Prenda</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>
            <div>
              <label htmlFor="lp-precio" className="mb-1 block text-rotulo uppercase text-muted">Precio (S/) *</label>
              <input id="lp-precio" type="number" min={0} step="0.5" value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} className={cn(campoCls, 'w-full tabular-nums')} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-cuerpo text-navy">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
            Se ofrece en ventas
          </label>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setAbierto(false)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>Cancelar</button>
          <Button type="button" onClick={guardar} pending={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
