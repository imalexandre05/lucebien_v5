'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Globe, Package, Scissors, Lock } from 'lucide-react';
import {
  ESTADOS_ACTIVO,
  PIEZAS_ACTIVO,
  activoBloqueadoPor,
  type ActivoInventario,
  type ActivoInput,
  type EstadoActivo,
  type PiezaActivo,
} from '@scilb/core';
import type { ProductoTipo } from '../../lib/producto-tipos-repo';
import { accionCrearActivo, accionEditarActivo, accionEliminarActivo, accionDespiezarActivo } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { EmptyState } from '../../components/ui/empty-state';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';

// Fase 7: 8 estados de ciclo completo (antes solo 4). TONE/LABEL como funciones con fallback en
// vez de Record estricto — una base sin migrar (o con datos viejos tipo 'en_lavanderia' antes del
// backfill de la 0055) puede traer un estado que no está en la lista; que se vea "gris + el texto
// crudo" es preferible a que la fila reviente.
const TONE: Partial<Record<EstadoActivo, Tone>> = {
  disponible: 'green',
  alquilado: 'amber',
  vendido: 'navy',
  en_pipeline: 'gold',
  codificando: 'gold',
  en_compostura: 'gold',
  en_almacen: 'gray',
  baja: 'red',
};
const LABEL: Partial<Record<EstadoActivo, string>> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  vendido: 'Vendido',
  en_pipeline: 'En pipeline',
  codificando: 'Codificando',
  en_compostura: 'En compostura',
  en_almacen: 'En almacén',
  baja: 'Baja',
};
const tonoEstado = (e: string): Tone => TONE[e as EstadoActivo] ?? 'gray';
const labelEstado = (e: string): string => LABEL[e as EstadoActivo] ?? e;

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

// Fase 7 — despiece: etiqueta corta junto al código. 'unica' (99% de los casos) no se etiqueta.
const PIEZA_LABEL: Partial<Record<PiezaActivo, string>> = {
  completo: 'Set completo',
  saco: 'Saco',
  pantalon: 'Pantalón',
};

const fieldCls = campoCls;

// Sede (Fase 2): un activo nuevo nace en la sede activa de quien lo registra — ya no se elige en
// un <select> aparte. Al editar, la sede existente del activo se conserva tal cual (ver
// abrirEditar/aInput más abajo); esta pantalla no reasigna un activo a otra sede.
const vacio = (sedeActual: string): ActivoInput => ({
  codigo: '',
  tipo: '',
  talla: '',
  color: '',
  sedeCod: sedeActual,
  estado: 'disponible',
  precioBase: 0,
  precioAlquiler: 0,
  precioVenta: 0,
  usosAcumulados: 0,
  atributos: {},
  publicable: false,
  descripcionPublica: '',
  pieza: 'unica',
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
  pieza: a.pieza,
});

export function InventarioCliente({
  activosIniciales,
  sedeActual,
  tiposProducto,
}: {
  activosIniciales: ActivoInventario[];
  sedeActual: string;
  tiposProducto: ProductoTipo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<{ id: string | null; form: ActivoInput; original: ActivoInventario | null } | null>(
    null,
  );
  const [error, setError] = useState('');
  // Edición rápida en línea (estilo Excel): estado, precios, talla, color — el resto va por el modal.
  const [editandoInline, setEditandoInline] = useState<Record<string, Partial<ActivoInput>>>({});

  const activos = activosIniciales;

  // Fase 7: código → activo, para resolver "ocupado por AST-501" a partir del id bloqueante, y
  // prefijo → tipo del catálogo, para mostrar el nombre legible junto al código crudo (TN → Terno).
  const porId = useMemo(() => new Map(activos.map((a) => [a.id, a])), [activos]);
  const catalogoPorPrefijo = useMemo(
    () => new Map(tiposProducto.map((t) => [t.prefijo.toUpperCase(), t])),
    [tiposProducto],
  );

  function abrirNuevo() {
    setError('');
    setModal({ id: null, form: vacio(sedeActual), original: null });
  }
  function abrirEditar(a: ActivoInventario) {
    setError('');
    setModal({ id: a.id, form: aInput(a), original: a });
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

  function despiezar(a: ActivoInventario) {
    if (!confirm(`¿Despiezar ${a.codigo} en saco + pantalón? Podrás alquilar/vender cada pieza por separado.`)) return;
    startTransition(async () => {
      const r = await accionDespiezarActivo(a.id);
      if (r.ok) {
        const piezas = r.piezas ?? [];
        alert(piezas.length ? `Despiezado: ${piezas.map((p) => p.codigo).join(' + ')}` : 'Despiezado.');
        router.refresh();
      } else {
        alert(r.error);
      }
    });
  }

  // Edición inline: guarda un campo (estado / precio / talla / color) sin abrir el modal completo.
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
  const tipoSeleccionadoCatalogo = useMemo(
    () => catalogoPorPrefijo.get((modal?.form.tipo ?? '').toUpperCase()) ?? null,
    [catalogoPorPrefijo, modal],
  );

  function setCampo<K extends keyof ActivoInput>(campo: K, valor: ActivoInput[K]) {
    setModal((m) => (m ? { ...m, form: { ...m.form, [campo]: valor } } : m));
  }
  function agregarAtributo() {
    setModal((m) => (m ? { ...m, form: { ...m.form, atributos: { ...m.form.atributos, '': '' } } } : m));
  }
  function usarAtributosSugeridos(claves: string[]) {
    setModal((m) => {
      if (!m) return m;
      const nuevos = { ...m.form.atributos };
      for (const k of claves) if (!(k in nuevos)) nuevos[k] = '';
      return { ...m, form: { ...m.form, atributos: nuevos } };
    });
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
                const catTipo = catalogoPorPrefijo.get(a.tipo.toUpperCase());
                // Bloqueo (Fase 7): solo se muestra cuando cambiaría la conclusión — un activo que
                // YA está alquilado/vendido/baja habla por sí solo; el aviso importa cuando el
                // estado propio dice 'disponible' pero el padre o un hijo está ocupado.
                const bloqueo = a.estado === 'disponible' ? activoBloqueadoPor(activos, a.id) : null;
                const padre = a.activoPadreId ? porId.get(a.activoPadreId) : null;
                return (
                  <TR key={a.id} className={cn(bloqueo && 'bg-aviso-soft/40')}>
                    <TD className="pl-5">
                      <div className="flex items-center gap-1 tabular-nums font-medium text-navy">
                        {a.codigo}
                        {a.publicable && <Globe className="h-3 w-3 text-exito" strokeWidth={2} aria-label="Publicable en la web" />}
                      </div>
                      {(PIEZA_LABEL[a.pieza] || padre) && (
                        <div className="text-micro text-muted">
                          {PIEZA_LABEL[a.pieza]}
                          {padre && ` de ${padre.codigo}`}
                        </div>
                      )}
                    </TD>
                    <TD>
                      {catTipo ? (
                        <>
                          <div className="text-sm text-navy">{catTipo.nombre}</div>
                          <div className="tabular-nums text-micro text-muted">{a.tipo}</div>
                        </>
                      ) : (
                        <span className="tabular-nums text-sm">{a.tipo}</span>
                      )}
                    </TD>
                    <TD>
                      <input
                        defaultValue={a.talla}
                        disabled={pending}
                        onBlur={(e) => {
                          if (e.target.value !== a.talla) guardarInline(a, { talla: e.target.value });
                        }}
                        className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
                      />
                    </TD>
                    <TD>
                      <input
                        defaultValue={a.color}
                        disabled={pending}
                        onBlur={(e) => {
                          if (e.target.value !== a.color) guardarInline(a, { color: e.target.value });
                        }}
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
                      />
                    </TD>
                    <TD className="tabular-nums">{a.sedeCod}</TD>
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
                            'rounded-r-pastilla border-0 px-2.5 py-1 text-xs font-medium outline-none',
                            tonoEstado(a.estado) === 'green' && 'bg-exito-soft text-exito-deep',
                            tonoEstado(a.estado) === 'amber' && 'bg-aviso-soft text-aviso-deep',
                            tonoEstado(a.estado) === 'navy' && 'bg-navy/10 text-navy',
                            tonoEstado(a.estado) === 'gold' && 'bg-gold/20 text-gold-deep',
                            tonoEstado(a.estado) === 'red' && 'bg-error/15 text-error-deep',
                            tonoEstado(a.estado) === 'gray' && 'bg-paper text-muted',
                          )}
                        >
                          {ESTADOS_ACTIVO.map((e) => (
                            <option key={e} value={e}>
                              {labelEstado(e)}
                            </option>
                          ))}
                        </select>
                      )}
                      {bloqueo && (
                        <div className="mt-1 inline-flex items-center gap-1 text-micro font-medium text-aviso-deep" title={`Bloqueado por ${bloqueo.codigo} (${labelEstado(bloqueo.estado)})`}>
                          <Lock className="h-2.5 w-2.5" strokeWidth={2.5} /> Ocupado por {bloqueo.codigo}
                        </div>
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
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
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
                        className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums text-sm text-navy transition-colors hover:border-line focus:border-gold focus:bg-white focus:outline-none"
                      />
                    </TD>
                    <TD className="text-right tabular-nums">{a.usosAcumulados}</TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-1">
                        {a.pieza === 'unica' && (
                          <button
                            type="button"
                            onClick={() => despiezar(a)}
                            disabled={pending}
                            aria-label="Despiezar en saco + pantalón"
                            title="Despiezar en saco + pantalón"
                            className="rounded-md p-1.5 text-muted transition-colors hover:bg-navy/5 hover:text-navy disabled:opacity-50"
                          >
                            <Scissors className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        )}
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
                          className="rounded-md p-1.5 text-muted transition-colors hover:bg-error-soft hover:text-error"
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
        Clic en el estado, precios, talla o color de una fila para editarlos al instante. El lápiz abre
        todos los datos, incluidos los atributos libres (tela, forro, etc.). Las tijeras despiezan un
        activo &ldquo;único&rdquo; en saco + pantalón — alquilar una pieza bloquea el set completo pero
        deja la otra pieza disponible.
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
                  <input value={modal.form.codigo} onChange={(e) => setCampo('codigo', e.target.value.toUpperCase())} placeholder="TN-042" className={cn(fieldCls, 'w-full tabular-nums')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
                  <input value={modal.form.tipo} onChange={(e) => setCampo('tipo', e.target.value)} placeholder="TN, CM, CO…" className={cn(fieldCls, 'w-full')} />
                  {tiposProducto.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tiposProducto.map((t) => (
                        <button
                          key={t.cod}
                          type="button"
                          aria-pressed={modal.form.tipo.toUpperCase() === t.prefijo.toUpperCase()}
                          onClick={() => setCampo('tipo', t.prefijo)}
                          className={cn(
                            'rounded-r-pastilla border px-2 py-0.5 text-micro font-medium transition-colors',
                            modal.form.tipo.toUpperCase() === t.prefijo.toUpperCase()
                              ? 'border-navy bg-navy text-paper'
                              : 'border-line text-muted hover:border-gold hover:text-navy',
                          )}
                        >
                          {t.nombre}
                        </button>
                      ))}
                    </div>
                  )}
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
                  {/* Fase 2: ya no es un <select> — un activo nuevo nace en tu sede activa; uno
                      existente conserva la suya (reubicarlo es un movimiento físico real, no un
                      campo de formulario — ver Fase 11, Solicitudes tienda↔almacén). */}
                  <div className={cn(fieldCls, 'flex w-full items-center tabular-nums text-navy')}>
                    {modal.form.sedeCod || '—'}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Estado</label>
                  <select value={modal.form.estado} onChange={(e) => setCampo('estado', e.target.value as EstadoActivo)} className={cn(fieldCls, 'w-full')}>
                    {ESTADOS_ACTIVO.map((e) => (
                      <option key={e} value={e}>
                        {labelEstado(e)}
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
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Pieza (despiece saco/pantalón)
                </label>
                <OpcionBotones
                  opciones={PIEZAS_ACTIVO.map((p) => ({ value: p, label: PIEZA_LABEL[p] ?? 'Única' }))}
                  value={modal.form.pieza}
                  onChange={(v) => setCampo('pieza', v)}
                  ariaLabel="Pieza"
                />
                {modal.original?.activoPadreId && (
                  <p className="mt-1.5 text-xs text-muted">
                    Vinculado a {porId.get(modal.original.activoPadreId)?.codigo ?? modal.original.activoPadreId}.
                  </p>
                )}
                <p className="mt-1.5 text-xs text-muted">
                  Normalmente esto lo fija el botón de tijeras de la tabla (despiece automático). Cámbialo
                  a mano solo para corregir datos.
                </p>
              </div>

              <div className="border-t border-line/60 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wide text-muted">
                    Atributos (tela, forro, cuello… lo que corresponda a este tipo)
                  </label>
                  <button type="button" onClick={agregarAtributo} className="toque inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy transition-colors hover:border-gold">
                    <Plus className="h-3 w-3" strokeWidth={2.5} /> Agregar
                  </button>
                </div>
                {tipoSeleccionadoCatalogo && tipoSeleccionadoCatalogo.atributosSugeridos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => usarAtributosSugeridos(tipoSeleccionadoCatalogo.atributosSugeridos)}
                    className="mb-2 text-left text-xs text-navy underline decoration-dotted underline-offset-2 hover:text-gold"
                  >
                    Usar sugeridos de &ldquo;{tipoSeleccionadoCatalogo.nombre}&rdquo;: {tipoSeleccionadoCatalogo.atributosSugeridos.join(', ')}
                  </button>
                )}
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
                        <button type="button" onClick={() => quitarAtributo(clave)} className="shrink-0 text-muted transition-colors hover:text-error" aria-label="Quitar atributo">
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

              {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={cerrarModal} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
                Cancelar
              </button>
              <Button type="button" onClick={guardarModal} pending={pending}>
                {pending ? 'Guardando…' : 'Guardar activo'}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
