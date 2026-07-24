'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Globe, Package } from 'lucide-react';
import { ESTADOS_ACTIVO, type ActivoInventario, type ActivoInput, type EstadoActivo } from '@scilb/core';
import { accionCrearActivo, accionEditarActivo, accionEliminarActivo } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { EmptyState } from '../../components/ui/empty-state';
import { cn } from '../../lib/cn';

const TONE: Record<EstadoActivo, Tone> = {
  disponible: 'green',
  alquilado: 'amber',
  en_lavanderia: 'navy',
  baja: 'gray',
};
const LABEL: Record<EstadoActivo, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  en_lavanderia: 'En lavandería',
  baja: 'Baja',
};
// Mismas etiquetas que el tablero de pipeline (app/pipeline/tablero.tsx) — un activo "en
// pipeline" muestra la etapa real en vez del estado comercial de reposo.
const ETAPA_LABEL: Record<string, string> = {
  recepcion: 'Recepción',
  lavado: 'Lavado',
  empatado: 'Empatado',
  refaccion: 'Refacción',
  compostura: 'Compostura',
  planchado: 'Planchado',
  control_calidad: 'Control calidad',
  listo: 'Listo p/ envío',
};

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

const vacio = (): ActivoInput => ({
  codigo: '',
  tipo: '',
  talla: '',
  color: '',
  sedeCod: '',
  estado: 'disponible',
  precioBase: 0,
  precioAlquiler: 0,
  precioVenta: 0,
  usosAcumulados: 0,
  atributos: {},
  publicable: false,
  descripcionPublica: '',
});

const aInput = (a: ActivoInventario): ActivoInput => ({
  codigo: a.codigo,
  tipo: a.tipo,
  talla: a.talla,
  color: a.color,
  sedeCod: a.sedeCod,
  estado: a.estado,
  precioBase: a.precioBase,
  precioAlquiler: a.precioAlquiler,
  precioVenta: a.precioVenta,
  usosAcumulados: a.usosAcumulados,
  atributos: a.atributos,
  publicable: a.publicable,
  descripcionPublica: a.descripcionPublica,
});

export function InventarioCliente({
  activosIniciales,
  sedes,
}: {
  activosIniciales: ActivoInventario[];
  sedes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<{ id: string | null; form: ActivoInput } | null>(null);
  const [error, setError] = useState('');
  // Edición rápida en línea (estilo Excel): solo estado y precios, lo demás va por el modal.
  const [editandoInline, setEditandoInline] = useState<Record<string, Partial<ActivoInput>>>({});

  const activos = activosIniciales;

  function abrirNuevo() {
    setError('');
    setModal({ id: null, form: vacio() });
  }
  function abrirEditar(a: ActivoInventario) {
    setError('');
    setModal({ id: a.id, form: aInput(a) });
  }
  function cerrarModal() {
    if (pending) return;
    setModal(null);
    setError('');
  }

  function guardarModal() {
    if (!modal) return;
    setError('');
    startTransition(async () => {
      const r = modal.id ? await accionEditarActivo(modal.id, modal.form) : await accionCrearActivo(modal.form);
      if (!r.ok) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Dar de baja este activo?')) return;
    startTransition(async () => {
      const r = await accionEliminarActivo(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  // Edición inline: guarda un campo (estado / precio) sin abrir el modal completo.
  function guardarInline(a: ActivoInventario, patch: Partial<ActivoInput>) {
    startTransition(async () => {
      const r = await accionEditarActivo(a.id, { ...aInput(a), ...patch });
      if (r.ok) {
        setEditandoInline((p) => {
          const { [a.id]: _quitar, ...resto } = p;
          return resto;
        });
        router.refresh();
      } else {
        alert(r.error);
      }
    });
  }

  const atributosLista = useMemo(() => Object.entries(modal?.form.atributos ?? {}), [modal]);

  function setCampo<K extends keyof ActivoInput>(campo: K, valor: ActivoInput[K]) {
    setModal((m) => (m ? { ...m, form: { ...m.form, [campo]: valor } } : m));
  }
  function agregarAtributo() {
    setModal((m) => (m ? { ...m, form: { ...m.form, atributos: { ...m.form.atributos, '': '' } } } : m));
  }
  function cambiarAtributoClave(claveVieja: string, claveNueva: string) {
    setModal((m) => {
      if (!m) return m;
      const entradas = Object.entries(m.form.atributos).map(([k, v]) => (k === claveVieja ? [claveNueva, v] : [k, v]));
      return { ...m, form: { ...m.form, atributos: Object.fromEntries(entradas) } };
    });
  }
  function cambiarAtributoValor(clave: string, valor: string) {
    setModal((m) => (m ? { ...m, form: { ...m.form, atributos: { ...m.form.atributos, [clave]: valor } } } : m));
  }
  function quitarAtributo(clave: string) {
    setModal((m) => {
      if (!m) return m;
      const { [clave]: _quitar, ...resto } = m.form.atributos;
      return { ...m, form: { ...m.form, atributos: resto } };
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-muted">{activos.length} activo(s) registrados</p>
          <button type="button" onClick={abrirNuevo} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo activo
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Código</TH>
                <TH>Tipo</TH>
                <TH>Talla</TH>
                <TH>Color</TH>
                <TH>Sede</TH>
                <TH>Estado</TH>
                <TH className="text-right">Alquiler</TH>
                <TH className="text-right">Venta</TH>
                <TH className="text-right">Usos</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {activos.map((a) => {
                const inl = editandoInline[a.id] ?? {};
                return (
                  <TR key={a.id}>
                    <TD className="pl-5 font-mono font-medium text-navy">
                      {a.codigo}
                      {a.publicable && <Globe className="ml-1 inline h-3 w-3 text-emerald-600" strokeWidth={2} aria-label="Publicable en la web" />}
                    </TD>
                    <TD>{a.tipo}</TD>
                    <TD>{a.talla}</TD>
                    <TD>{a.color}</TD>
                    <TD className="font-mono">{a.sedeCod}</TD>
                    <TD>
                      {a.enPipeline ? (
                        <span title="Prevalece sobre el estado comercial mientras está en proceso">
                          <Badge tone="gold">En pipeline · {ETAPA_LABEL[a.enPipeline.etapa] ?? a.enPipeline.etapa}</Badge>
                        </span>
                      ) : (
                        <select
                          value={inl.estado ?? a.estado}
                          onChange={(e) => guardarInline(a, { estado: e.target.value as EstadoActivo })}
                          disabled={pending}
                          className={cn(
                            'rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none',
                            TONE[a.estado] === 'green' && 'bg-emerald-50 text-emerald-700',
                            TONE[a.estado] === 'amber' && 'bg-amber-50 text-amber-700',
                            TONE[a.estado] === 'navy' && 'bg-navy/10 text-navy',
                            TONE[a.estado] === 'gray' && 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {ESTADOS_ACTIVO.map((e) => (
                            <option key={e} value={e}>
                              {LABEL[e]}
                            </option>
                          ))}
                        </select>
                      )}
                    </TD>
                    <TD className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={a.precioAlquiler}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== a.precioAlquiler) guardarInline(a, { precioAlquiler: v });
                        }}
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
                      />
                    </TD>
                    <TD className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={a.precioVenta}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== a.precioVenta) guardarInline(a, { precioVenta: v });
                        }}
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
                      />
                    </TD>
                    <TD className="text-right font-mono">{a.usosAcumulados}</TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEditar(a)}
                          aria-label="Editar todos los datos"
                          title="Editar todos los datos"
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-navy/5 hover:text-navy"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminar(a.id)}
                          aria-label="Dar de baja"
                          title="Dar de baja"
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
              {activos.length === 0 && (
                <TR>
                  <TD colSpan={10} className="px-5 py-10">
                    <EmptyState icon={Package} titulo="Sin activos en el inventario todavía">
                      Usa &ldquo;Nuevo activo&rdquo; para dar de alta el primero.
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted">
        Clic en el estado o los precios de una fila para editarlos al instante. El lápiz abre todos los
        datos, incluidos los atributos libres (tela, forro, etc.) — no hay una lista fija por tipo de prenda.
      </p>

      <Modal
        open={modal !== null}
        onClose={cerrarModal}
        title={modal?.id ? 'Editar activo' : 'Nuevo activo'}
        size="lg"
      >
        {modal && (
          <>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Código</label>
                  <input value={modal.form.codigo} onChange={(e) => setCampo('codigo', e.target.value.toUpperCase())} placeholder="TN-042" className={cn(fieldCls, 'w-full font-mono')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
                  <input value={modal.form.tipo} onChange={(e) => setCampo('tipo', e.target.value)} placeholder="TN, CM, CO…" className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Talla</label>
                  <input value={modal.form.talla} onChange={(e) => setCampo('talla', e.target.value)} placeholder="40 / M" className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Color</label>
                  <input value={modal.form.color} onChange={(e) => setCampo('color', e.target.value)} placeholder="Navy" className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Sede</label>
                  <select value={modal.form.sedeCod} onChange={(e) => setCampo('sedeCod', e.target.value)} className={cn(fieldCls, 'w-full')}>
                    <option value="">Elige…</option>
                    {sedes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Estado</label>
                  <select value={modal.form.estado} onChange={(e) => setCampo('estado', e.target.value as EstadoActivo)} className={cn(fieldCls, 'w-full')}>
                    {ESTADOS_ACTIVO.map((e) => (
                      <option key={e} value={e}>
                        {LABEL[e]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Precio base</label>
                  <input type="number" step="0.01" value={modal.form.precioBase} onChange={(e) => setCampo('precioBase', Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Precio alquiler</label>
                  <input type="number" step="0.01" value={modal.form.precioAlquiler} onChange={(e) => setCampo('precioAlquiler', Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Precio venta</label>
                  <input type="number" step="0.01" value={modal.form.precioVenta} onChange={(e) => setCampo('precioVenta', Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Usos acumulados</label>
                  <input type="number" value={modal.form.usosAcumulados} onChange={(e) => setCampo('usosAcumulados', Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
              </div>

              <div className="border-t border-line/60 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wide text-muted">
                    Atributos (tela, forro, cuello… lo que corresponda a este tipo)
                  </label>
                  <button type="button" onClick={agregarAtributo} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors hover:border-gold">
                    <Plus className="h-3 w-3" strokeWidth={2.5} /> Agregar
                  </button>
                </div>
                {atributosLista.length === 0 ? (
                  <p className="text-xs text-muted">Sin atributos agregados.</p>
                ) : (
                  <div className="space-y-2">
                    {atributosLista.map(([clave, valor], i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={clave}
                          onChange={(e) => cambiarAtributoClave(clave, e.target.value)}
                          placeholder="Atributo (ej. tela)"
                          className={cn(fieldCls, 'w-1/3')}
                        />
                        <input
                          value={valor}
                          onChange={(e) => cambiarAtributoValor(clave, e.target.value)}
                          placeholder="Valor (ej. lana)"
                          className={cn(fieldCls, 'flex-1')}
                        />
                        <button type="button" onClick={() => quitarAtributo(clave)} className="shrink-0 text-muted transition-colors hover:text-red-600" aria-label="Quitar atributo">
                          <X className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-line/60 pt-3">
                <label className="flex items-center gap-2 text-sm text-navy">
                  <input type="checkbox" checked={modal.form.publicable} onChange={(e) => setCampo('publicable', e.target.checked)} className="h-4 w-4 rounded border-line" />
                  Mostrar en el catálogo público (web)
                </label>
                {modal.form.publicable && (
                  <textarea
                    value={modal.form.descripcionPublica}
                    onChange={(e) => setCampo('descripcionPublica', e.target.value)}
                    placeholder="Descripción para el catálogo público…"
                    rows={2}
                    className={cn(fieldCls, 'mt-2 w-full')}
                  />
                )}
              </div>

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={cerrarModal} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
                Cancelar
              </button>
              <button type="button" onClick={guardarModal} disabled={pending} className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}>
                {pending ? 'Guardando…' : 'Guardar activo'}
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
