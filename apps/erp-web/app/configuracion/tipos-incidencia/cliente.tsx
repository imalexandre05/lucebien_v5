'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { TipoIncidenciaAdmin, TipoIncidenciaInput } from '../../../lib/incidencias-repo';
import {
  accionCrearTipoIncidencia,
  accionEditarTipoIncidencia,
  accionActivarTipoIncidencia,
  accionEliminarTipoIncidencia,
} from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { EmptyState } from '../../../components/ui/empty-state';
import { Button, buttonVariants } from '../../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../../components/ui/opcion-botones';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

// Mismo orden/colores que /incidencias/cliente.tsx (NIVELES) para que la gravedad se vea igual
// en el catálogo y en el formulario que lo consume.
const NIVELES: Opcion[] = [
  { value: 'Alto', label: 'Alto' },
  { value: 'Medio', label: 'Medio' },
  { value: 'Bajo', label: 'Bajo' },
];

function NivelPill({ nivel }: { nivel: string }) {
  const cls =
    nivel === 'Alto' ? 'bg-error-soft text-error-deep' : nivel === 'Medio' ? 'bg-aviso-soft text-aviso-deep' : 'bg-paper text-muted';
  return <span className={cn('inline-flex items-center rounded-r-pastilla px-2.5 py-0.5 text-xs font-medium', cls)}>{nivel}</span>;
}

const VACIO: TipoIncidenciaInput = { tipo: '', categoria: '', nivelDefault: 'Medio', puntosDefault: 2 };

type ModalState = { modo: 'nuevo' } | { modo: 'editar'; original: TipoIncidenciaAdmin } | null;

export function TiposIncidenciaCliente({ tipos }: { tipos: TipoIncidenciaAdmin[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  // Un error de la LISTA no cabe dentro del formulario: cuando se dispara, ese bloque suele
  // estar cerrado y el mensaje se renderizaria invisible. Va arriba de todo.
  const [errorAccion, setErrorAccion] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [eliminar, setEliminar] = useState<TipoIncidenciaAdmin | null>(null);
  const [form, setForm] = useState<TipoIncidenciaInput>(VACIO);

  const categoriasExistentes = useMemo(
    () => [...new Set(tipos.map((t) => t.categoria).filter((c): c is string => Boolean(c)))].sort(),
    [tipos],
  );

  function abrirNuevo() {
    setForm(VACIO);
    setError('');
    setModal({ modo: 'nuevo' });
  }
  function abrirEditar(t: TipoIncidenciaAdmin) {
    setForm({ tipo: t.tipo, categoria: t.categoria ?? '', nivelDefault: t.nivelDefault, puntosDefault: t.puntosDefault });
    setError('');
    setModal({ modo: 'editar', original: t });
  }

  function guardar() {
    if (!modal) return;
    setError('');
    startTransition(async () => {
      const r = modal.modo === 'nuevo' ? await accionCrearTipoIncidencia(form) : await accionEditarTipoIncidencia(modal.original.id, form);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function toggleActivo(t: TipoIncidenciaAdmin) {
    startTransition(async () => {
      const r = await accionActivarTipoIncidencia(t.id, !t.activo);
      if (r.ok) router.refresh();
      else setErrorAccion(r.error ?? 'No se pudo cambiar el estado del tipo.');
    });
  }

  function confirmarEliminar() {
    if (!eliminar) return;
    startTransition(async () => {
      const r = await accionEliminarTipoIncidencia(eliminar.id);
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
      {errorAccion && <Aviso tono="error">{errorAccion}</Aviso>}

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-muted">
            {tipos.length} tipo(s) en el catálogo · alimenta el selector de gravedad/puntos al registrar una incidencia
          </p>
          <button type="button" onClick={abrirNuevo} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo tipo
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {tipos.length === 0 ? (
            <EmptyState icon={AlertOctagon} titulo="Sin tipos en el catálogo todavía">
              Crea el primero con &ldquo;Nuevo tipo&rdquo;.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Tipo</TH>
                  <TH>Categoría</TH>
                  <TH>Gravedad</TH>
                  <TH>Puntos</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {tipos.map((t) => (
                  <TR key={t.id} className={cn(!t.activo && 'opacity-55')}>
                    <TD className="pl-5 text-sm font-medium text-navy">{t.tipo}</TD>
                    <TD className="text-xs text-muted">{t.categoria || '—'}</TD>
                    <TD>
                      <NivelPill nivel={t.nivelDefault} />
                    </TD>
                    <TD className="tabular-nums text-sm text-navy">{t.puntosDefault}</TD>
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
                          aria-label={`Eliminar ${t.tipo}`}
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
        title={modal?.modo === 'editar' ? `Editar: ${modal.original.tipo}` : 'Nuevo tipo de incidencia'}
      >
        <ModalBody className="space-y-4">
          <div>
            <label htmlFor="ti-tipo" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Nombre del tipo *
            </label>
            <input
              id="ti-tipo"
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              placeholder="ej. Prenda entregada en mal estado"
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          <div>
            <label htmlFor="ti-categoria" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Categoría (agrupa el catálogo, texto libre)
            </label>
            <input
              id="ti-categoria"
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              placeholder="ej. Graves"
              className={cn(fieldCls, 'w-full')}
            />
            {categoriasExistentes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {categoriasExistentes.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, categoria: c }))}
                    className="rounded-r-pastilla border border-line px-2.5 py-0.5 text-[11px] text-muted hover:border-gold hover:text-navy"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Gravedad por defecto</label>
              <OpcionBotones opciones={NIVELES} value={form.nivelDefault} onChange={(v) => setForm((f) => ({ ...f, nivelDefault: v }))} />
            </div>
            <div>
              <label htmlFor="ti-puntos" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Puntos de penalidad por defecto
              </label>
              <input
                id="ti-puntos"
                type="number"
                min={0}
                step={0.5}
                value={form.puntosDefault}
                onChange={(e) => setForm((f) => ({ ...f, puntosDefault: Number(e.target.value) }))}
                className={cn(fieldCls, 'w-full text-right')}
              />
            </div>
          </div>
          <p className="text-xs text-muted">Gravedad y puntos son solo el valor sugerido al elegir este tipo — quien registra la incidencia los puede ajustar.</p>
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
            <span className="font-medium text-ink">{eliminar?.tipo}</span> se quita del catálogo. Las incidencias que ya se registraron
            con este tipo no cambian (el campo tipo sigue siendo texto libre).
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
