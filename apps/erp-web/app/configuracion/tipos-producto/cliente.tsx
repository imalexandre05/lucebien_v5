'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Shirt, AlertTriangle } from 'lucide-react';
import type { ProductoTipo } from '../../../lib/producto-tipos-repo';
import {
  accionCrearTipoProducto,
  accionEditarTipoProducto,
  accionActivarTipoProducto,
  accionEliminarTipoProducto,
} from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { EmptyState } from '../../../components/ui/empty-state';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

type Form = { cod: string; nombre: string; prefijo: string; atributosSugeridos: string[] };
const VACIO: Form = { cod: '', nombre: '', prefijo: '', atributosSugeridos: [] };

type ModalState = { modo: 'nuevo' } | { modo: 'editar'; original: ProductoTipo } | null;

export function TiposProductoCliente({ tipos }: { tipos: ProductoTipo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [eliminar, setEliminar] = useState<ProductoTipo | null>(null);
  const [form, setForm] = useState<Form>(VACIO);
  const [nuevaClave, setNuevaClave] = useState('');

  function abrirNuevo() {
    setForm(VACIO);
    setNuevaClave('');
    setError('');
    setModal({ modo: 'nuevo' });
  }
  function abrirEditar(t: ProductoTipo) {
    setForm({ cod: t.cod, nombre: t.nombre, prefijo: t.prefijo, atributosSugeridos: [...t.atributosSugeridos] });
    setNuevaClave('');
    setError('');
    setModal({ modo: 'editar', original: t });
  }

  function agregarClave() {
    const k = nuevaClave.trim().toLowerCase();
    if (!k || form.atributosSugeridos.includes(k)) return;
    setForm((f) => ({ ...f, atributosSugeridos: [...f.atributosSugeridos, k] }));
    setNuevaClave('');
  }
  function quitarClave(k: string) {
    setForm((f) => ({ ...f, atributosSugeridos: f.atributosSugeridos.filter((x) => x !== k) }));
  }

  function guardar() {
    if (!modal) return;
    setError('');
    startTransition(async () => {
      const r =
        modal.modo === 'nuevo'
          ? await accionCrearTipoProducto(form)
          : await accionEditarTipoProducto(modal.original.cod, form);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function toggleActivo(t: ProductoTipo) {
    startTransition(async () => {
      const r = await accionActivarTipoProducto(t.cod, !t.activo);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function confirmarEliminar() {
    if (!eliminar) return;
    startTransition(async () => {
      const r = await accionEliminarTipoProducto(eliminar.cod);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setEliminar(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-muted">
            {tipos.length} tipo(s) en el catálogo · sugiere el prefijo del código y los atributos por tipo
          </p>
          <button type="button" onClick={abrirNuevo} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo tipo
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {tipos.length === 0 ? (
            <EmptyState icon={Shirt} titulo="Sin tipos en el catálogo todavía">
              Crea el primero con &ldquo;Nuevo tipo&rdquo;. Si esperabas ver el catálogo sembrado por
              defecto, puede que la migración 0055 todavía no se haya aplicado en esta base.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Prefijo</TH>
                  <TH>Nombre</TH>
                  <TH>Atributos sugeridos</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {tipos.map((t) => (
                  <TR key={t.cod} className={cn(!t.activo && 'opacity-55')}>
                    <TD className="pl-5 font-mono text-sm font-semibold text-navy">{t.prefijo}</TD>
                    <TD>
                      <div className="text-sm font-medium text-navy">{t.nombre}</div>
                      <div className="font-mono text-[10px] text-muted">{t.cod}</div>
                    </TD>
                    <TD className="text-xs text-muted">
                      {t.atributosSugeridos.length ? t.atributosSugeridos.join(', ') : '—'}
                    </TD>
                    <TD>
                      <button
                        type="button"
                        onClick={() => toggleActivo(t)}
                        disabled={pending}
                        className={cn(
                          'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors duration-150 active:scale-[0.97]',
                          t.activo
                            ? 'border-line text-muted hover:border-error-line hover:text-error'
                            : 'border-exito-line bg-exito-soft text-exito-deep hover:bg-exito-soft',
                        )}
                      >
                        {t.activo ? 'Deshab.' : 'Activar'}
                      </button>
                    </TD>
                    <TD className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirEditar(t)}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]"
                        >
                          <Pencil className="h-3 w-3" strokeWidth={2} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEliminar(t)}
                          aria-label={`Eliminar ${t.nombre}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-error-soft hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Nuevo/Editar ── */}
      <Modal
        open={modal !== null}
        onClose={() => !pending && setModal(null)}
        size="md"
        title={modal?.modo === 'editar' ? `Editar: ${modal.original.nombre}` : 'Nuevo tipo de producto'}
      >
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tp-cod" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Código interno *
              </label>
              <input
                id="tp-cod"
                value={form.cod}
                disabled={modal?.modo === 'editar'}
                onChange={(e) => setForm((f) => ({ ...f, cod: e.target.value }))}
                placeholder="pantalon"
                className={cn(fieldCls, 'w-full font-mono disabled:bg-paper disabled:text-muted')}
              />
            </div>
            <div>
              <label htmlFor="tp-prefijo" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Prefijo de código *
              </label>
              <input
                id="tp-prefijo"
                value={form.prefijo}
                onChange={(e) => setForm((f) => ({ ...f, prefijo: e.target.value.toUpperCase() }))}
                placeholder="PT"
                maxLength={4}
                className={cn(fieldCls, 'w-full font-mono uppercase')}
              />
            </div>
          </div>
          <div>
            <label htmlFor="tp-nombre" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Nombre *
            </label>
            <input
              id="tp-nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Pantalón"
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Atributos sugeridos (solo sugiere, no restringe)
            </label>
            <div className="flex gap-2">
              <input
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    agregarClave();
                  }
                }}
                placeholder="ej. tela"
                className={cn(fieldCls, 'flex-1')}
              />
              <button type="button" onClick={agregarClave} className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
                Agregar
              </button>
            </div>
            {form.atributosSugeridos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.atributosSugeridos.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2.5 py-1 text-xs text-navy">
                    {k}
                    <button type="button" onClick={() => quitarClave(k)} aria-label={`Quitar ${k}`} className="text-muted hover:text-error">
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setModal(null)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={guardar} pending={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Modal eliminar ── */}
      <Modal
        open={eliminar !== null}
        onClose={() => !pending && setEliminar(null)}
        size="sm"
        title="¿Eliminar tipo?"
        icon={<AlertTriangle className="h-5 w-5 shrink-0 text-aviso" strokeWidth={2} aria-hidden />}
      >
        <ModalBody>
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{eliminar?.nombre}</span> se quita del catálogo. Los
            activos que ya usan este tipo como texto libre no cambian (el campo tipo sigue siendo libre).
          </p>
          {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setEliminar(null)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={confirmarEliminar} pending={pending} className="bg-error hover:bg-error-deep">
            {pending ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
