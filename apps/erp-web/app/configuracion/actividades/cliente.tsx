'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Filter, Pencil, Trash2, Copy, ClipboardList, AlertTriangle } from 'lucide-react';
import type { Sede } from '../../../lib/sedes-repo';
import type { ActividadAdmin, ActividadInput } from '../../../lib/actividades-repo';
import {
  accionCrearActividad,
  accionEditarActividad,
  accionActivarActividad,
  accionEliminarActividad,
  accionDuplicarActividades,
} from './actions';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge, type Tone } from '../../../components/ui/badge';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { EmptyState } from '../../../components/ui/empty-state';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso, campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const fieldCls = campoCls;

const CAT_LABEL: Record<string, string> = { PO: 'Primer Orden', SO: '2° Orden', IND: 'Indispensable', EXT: 'Extra' };
const CAT_TONE: Record<string, Tone> = { PO: 'navy', SO: 'gold', IND: 'green', EXT: 'gray' };
const DIAS = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'];

function frecuenciaLabel(a: ActividadAdmin): string {
  if (a.frecuenciaDias === 7) {
    const dias = a.diaSemana || '—';
    return a.apareceDia > 1 ? `${dias} · c/${a.apareceDia} sem` : dias;
  }
  if (a.frecuenciaDias > 1) return `cada ${a.frecuenciaDias} días`;
  return 'Diaria';
}

const VACIA: ActividadInput = {
  nombre: '',
  categoria: 'PO',
  tipoAct: 'obligatoria',
  peso: 1,
  descuento: 0,
  turno: 'ambos',
  frecuenciaDias: 0,
  diaSemana: '',
  apareceDia: 0,
  acumula: true,
  precioUnitario: 0,
  unidad: 'unidad',
  orden: 0,
};

type ModalState =
  | { modo: 'nueva' }
  | { modo: 'editar'; act: ActividadAdmin }
  | null;

// Botón segmentado simple (Obligatoria/Extra, turno, periodicidad).
function Segmento<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { v: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors duration-150 active:scale-[0.97]',
            valor === o.v
              ? 'border-navy bg-navy text-paper'
              : 'border-line bg-white text-muted hover:border-gold',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ActividadesCliente({
  sede,
  sedes,
  actividades,
  sedesPorCod,
}: {
  sede: string;
  sedes: Sede[];
  actividades: ActividadAdmin[];
  sedesPorCod: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // Filtros
  const [q, setQ] = useState('');
  const [fTipo, setFTipo] = useState<'todas' | 'obligatoria' | 'extra'>('todas');

  // Modales
  const [modal, setModal] = useState<ModalState>(null);
  const [eliminar, setEliminar] = useState<ActividadAdmin | null>(null);
  const [duplicarDe, setDuplicarDe] = useState('');
  const [duplicarAbierto, setDuplicarAbierto] = useState(false);

  // Formulario del modal
  const [form, setForm] = useState<ActividadInput>(VACIA);
  const [relacion, setRelacion] = useState<'S' | 'T'>('T');
  const [formSedes, setFormSedes] = useState<string[]>([]);
  const [periodicidad, setPeriodicidad] = useState<'diaria' | 'semanal' | 'custom'>('diaria');

  const esExtra = form.tipoAct !== 'obligatoria';

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return actividades.filter((a) => {
      if (fTipo === 'obligatoria' && a.tipoAct !== 'obligatoria') return false;
      if (fTipo === 'extra' && a.tipoAct === 'obligatoria') return false;
      if (needle && !`${a.nombre} ${a.cod}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [actividades, q, fTipo]);

  const obligatorias = filtradas.filter((a) => a.tipoAct === 'obligatoria');
  const extras = filtradas.filter((a) => a.tipoAct !== 'obligatoria');

  function abrirNueva() {
    setForm(VACIA);
    setRelacion('T');
    setFormSedes([sede]);
    setPeriodicidad('diaria');
    setError('');
    setModal({ modo: 'nueva' });
  }

  function abrirEditar(a: ActividadAdmin) {
    setForm({
      nombre: a.nombre,
      categoria: a.categoria,
      tipoAct: a.tipoAct,
      peso: a.peso,
      descuento: a.descuento,
      turno: a.turno,
      frecuenciaDias: a.frecuenciaDias,
      diaSemana: a.diaSemana,
      apareceDia: a.apareceDia,
      acumula: a.acumula,
      precioUnitario: a.precioUnitario,
      unidad: a.unidad,
      orden: a.orden,
    });
    setRelacion(/^[AB]S/.test(a.cod) ? 'S' : 'T');
    setFormSedes(sedesPorCod[a.cod] ?? [a.sedeCod]);
    setPeriodicidad(a.frecuenciaDias === 7 ? 'semanal' : a.frecuenciaDias > 1 ? 'custom' : 'diaria');
    setError('');
    setModal({ modo: 'editar', act: a });
  }

  function guardar() {
    if (!modal) return;
    setError('');
    const p: ActividadInput = {
      ...form,
      categoria: esExtra ? 'EXT' : form.categoria,
      frecuenciaDias: esExtra ? 0 : periodicidad === 'diaria' ? 0 : periodicidad === 'semanal' ? 7 : Math.max(2, form.frecuenciaDias || 2),
      diaSemana: !esExtra && periodicidad === 'semanal' ? form.diaSemana : '',
      apareceDia: !esExtra && periodicidad === 'semanal' ? Math.max(1, form.apareceDia || 1) : 0,
      acumula: esExtra ? false : form.acumula,
      descuento: esExtra ? 0 : form.descuento,
      turno: esExtra ? 'ambos' : form.turno,
    };
    startTransition(async () => {
      const r =
        modal.modo === 'nueva'
          ? await accionCrearActividad(formSedes, relacion, p)
          : await accionEditarActividad(modal.act.id, modal.act.cod, formSedes, p);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function toggleActiva(a: ActividadAdmin) {
    startTransition(async () => {
      const r = await accionActivarActividad(a.id, !a.activa);
      if (r.ok) router.refresh();
    });
  }

  function confirmarEliminar() {
    if (!eliminar) return;
    startTransition(async () => {
      const r = await accionEliminarActividad(eliminar.id);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setEliminar(null);
      router.refresh();
    });
  }

  function duplicar() {
    startTransition(async () => {
      const r = await accionDuplicarActividades(duplicarDe, sede);
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setDuplicarAbierto(false);
      router.refresh();
    });
  }

  const toggleSedeForm = (cod: string) =>
    setFormSedes((p) => (p.includes(cod) ? p.filter((c) => c !== cod) : [...p, cod]));

  const toggleDia = (d: string) => {
    const set = new Set(form.diaSemana.split(/\s+/).filter(Boolean));
    if (set.has(d)) set.delete(d);
    else set.add(d);
    setForm((f) => ({ ...f, diaSemana: DIAS.filter((x) => set.has(x)).join(' ') }));
  };

  const fila = (a: ActividadAdmin, i: number) => (
    <TR key={a.id} className={cn(!a.activa && 'opacity-55')}>
      <TD className="pl-5 tabular-nums text-xs text-muted">{i + 1}</TD>
      <TD>
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-r-pastilla', a.activa ? 'bg-exito' : 'bg-error')} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-navy">{a.nombre}</div>
            <div className="tabular-nums text-micro text-muted">{a.cod}</div>
          </div>
        </div>
      </TD>
      <TD>
        <Badge tone={CAT_TONE[a.categoria] ?? 'gray'}>{CAT_LABEL[a.categoria] ?? a.categoria}</Badge>
      </TD>
      <TD className="text-xs capitalize text-muted">{a.turno === 'ambos' ? 'ambos' : a.turno}</TD>
      <TD className="text-right tabular-nums text-sm font-semibold text-navy">{a.peso}</TD>
      <TD className={cn('text-right tabular-nums text-xs', a.descuento > 0 ? 'text-error' : 'text-muted')}>
        {a.descuento > 0 ? `-${a.descuento}` : '—'}
      </TD>
      <TD className="text-xs text-muted">{a.tipoAct === 'obligatoria' ? frecuenciaLabel(a) : '—'}</TD>
      <TD className="text-center tabular-nums text-xs">{a.tipoAct === 'obligatoria' ? (a.acumula ? 'S' : 'N') : '—'}</TD>
      <TD>
        <button
          type="button"
          onClick={() => toggleActiva(a)}
          disabled={pending}
          className={cn(
            'rounded-r-pastilla border px-2 py-1 text-micro font-medium transition-colors duration-150 active:scale-[0.97]',
            a.activa
              ? 'border-line text-muted hover:border-error-line hover:text-error'
              : 'border-exito-line bg-exito-soft text-exito-deep hover:bg-exito-soft',
          )}
        >
          {a.activa ? 'Deshab.' : 'Activar'}
        </button>
      </TD>
      <TD className="pr-5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => abrirEditar(a)}
            className="inline-flex items-center gap-1 rounded-r-pastilla border border-line px-2 py-1 text-xs text-navy transition-colors duration-150 hover:border-gold active:scale-[0.97]"
          >
            <Pencil className="h-3 w-3" strokeWidth={2} /> Editar
          </button>
          <button
            type="button"
            onClick={() => setEliminar(a)}
            aria-label={`Eliminar ${a.nombre}`}
            className="flex h-7 w-7 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-error-soft hover:text-error"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </TD>
    </TR>
  );

  return (
    <div className="space-y-4">
      {/* Tabs de sede + acciones (como el viejo: General/LuceBien/Stan/Trece/Almacén) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3.5">
          {sedes.map((s) => (
            <Link
              key={s.cod}
              href={`/configuracion/actividades?sede=${s.cod}`}
              aria-current={s.cod === sede ? 'page' : undefined}
              className={cn(
                'rounded-r-pastilla px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                s.cod === sede ? 'bg-navy text-paper' : 'text-muted hover:bg-navy/5 hover:text-navy',
              )}
            >
              {s.nombre}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDuplicarDe(sedes.find((s) => s.cod !== sede)?.cod ?? '');
                setDuplicarAbierto(true);
                setError('');
              }}
              className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} /> Duplicar de sede
            </button>
            <Link href="/configuracion/layout" className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
              Layout
            </Link>
            <button type="button" onClick={abrirNueva} className={buttonVariants({ variant: 'primary' })}>
              <Plus className="h-4 w-4" strokeWidth={2} /> Nueva actividad
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3.5">
          <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold uppercase text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar actividad o código…"
            aria-label="Buscar actividad"
            className={`${fieldCls} min-w-[14rem] flex-1`}
          />
          <Segmento
            opciones={[
              { v: 'todas' as const, label: `Todas (${actividades.length})` },
              { v: 'obligatoria' as const, label: `Oblig. (${actividades.filter((a) => a.tipoAct === 'obligatoria').length})` },
              { v: 'extra' as const, label: `Extras (${actividades.filter((a) => a.tipoAct !== 'obligatoria').length})` },
            ]}
            valor={fTipo}
            onChange={setFTipo}
          />
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {filtradas.length === 0 ? (
            <EmptyState icon={ClipboardList} titulo="Sin actividades en esta sede">
              Crea la primera con “Nueva actividad” o copia el catálogo con “Duplicar de sede”.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10 pl-5">#</TH>
                  <TH>Nombre</TH>
                  <TH>Cat.</TH>
                  <TH>Turno</TH>
                  <TH className="text-right">Peso</TH>
                  <TH className="text-right">Desc.</TH>
                  <TH>Frecuencia</TH>
                  <TH className="text-center">Acum.</TH>
                  <TH>Estado</TH>
                  <TH className="pr-5 text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {obligatorias.length > 0 && (
                  <TR className="bg-paper/60 hover:bg-paper/60">
                    <TD colSpan={10} className="pl-5 text-xs font-semibold uppercase tracking-wide text-muted">
                      Obligatorias ({obligatorias.length})
                    </TD>
                  </TR>
                )}
                {obligatorias.map(fila)}
                {extras.length > 0 && (
                  <TR className="bg-paper/60 hover:bg-paper/60">
                    <TD colSpan={10} className="pl-5 text-xs font-semibold uppercase tracking-wide text-muted">
                      Extras · por puntos ({extras.length})
                    </TD>
                  </TR>
                )}
                {extras.map(fila)}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Nueva/Editar ── */}
      <Modal
        open={modal !== null}
        onClose={() => !pending && setModal(null)}
        size="lg"
        title={modal?.modo === 'editar' ? `Editar: ${modal.act.nombre}` : 'Nueva actividad'}
        subtitle={modal?.modo === 'editar' ? `Código ${modal.act.cod}` : 'El código se genera solo'}
      >
        <ModalBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          <Segmento
            opciones={[
              { v: 'obligatoria', label: 'Obligatoria' },
              { v: 'por_puntos', label: 'Extra (puntos)' },
            ]}
            valor={form.tipoAct as 'obligatoria' | 'por_puntos'}
            onChange={(v) => setForm((f) => ({ ...f, tipoAct: v }))}
          />

          <div>
            <label htmlFor="act-nombre" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Nombre *
            </label>
            <input
              id="act-nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Revisión de garantías"
              className={cn(fieldCls, 'w-full')}
            />
          </div>

          {!esExtra && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="act-cat" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Categoría
                </label>
                <select
                  id="act-cat"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  className={cn(fieldCls, 'w-full')}
                >
                  <option value="PO">Primer Orden</option>
                  <option value="SO">2° Orden</option>
                  <option value="IND">Indispensable</option>
                </select>
              </div>
              {modal?.modo === 'nueva' && form.categoria !== 'IND' && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted">Relacionado a</div>
                  <Segmento
                    opciones={[
                      { v: 'T' as const, label: 'Ternos' },
                      { v: 'S' as const, label: 'Software' },
                    ]}
                    valor={relacion}
                    onChange={setRelacion}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="act-peso" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Puntos
              </label>
              <input
                id="act-peso"
                type="number"
                step="0.5"
                min={0}
                value={form.peso}
                onChange={(e) => setForm((f) => ({ ...f, peso: Number(e.target.value) }))}
                className={cn(fieldCls, 'w-full text-right')}
              />
            </div>
            {esExtra ? (
              <div>
                <label htmlFor="act-unidad" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Unidad
                </label>
                <input
                  id="act-unidad"
                  value={form.unidad}
                  onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                  placeholder="unidad, docena…"
                  className={cn(fieldCls, 'w-full')}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="act-desc" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Descuento si no cumple
                </label>
                <input
                  id="act-desc"
                  type="number"
                  step="0.5"
                  min={0}
                  value={form.descuento}
                  onChange={(e) => setForm((f) => ({ ...f, descuento: Number(e.target.value) }))}
                  className={cn(fieldCls, 'w-full text-right')}
                />
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">Sedes</div>
            <div className="flex flex-wrap gap-1.5">
              {sedes.map((s) => (
                <button
                  key={s.cod}
                  type="button"
                  aria-pressed={formSedes.includes(s.cod)}
                  onClick={() => toggleSedeForm(s.cod)}
                  className={cn(
                    'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors duration-150 active:scale-[0.97]',
                    formSedes.includes(s.cod)
                      ? 'border-navy bg-navy/10 text-navy'
                      : 'border-line bg-white text-muted hover:border-gold',
                  )}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>

          {!esExtra && (
            <>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted">Turno</div>
                <Segmento
                  opciones={[
                    { v: 'ambos', label: 'Ambos' },
                    { v: 'mañana', label: 'Mañana' },
                    { v: 'tarde', label: 'Tarde' },
                  ]}
                  valor={form.turno}
                  onChange={(v) => setForm((f) => ({ ...f, turno: v }))}
                />
              </div>

              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted">Periodicidad</div>
                <Segmento
                  opciones={[
                    { v: 'diaria' as const, label: 'Cada día' },
                    { v: 'custom' as const, label: 'Cada X días' },
                    { v: 'semanal' as const, label: 'Días específicos' },
                  ]}
                  valor={periodicidad}
                  onChange={setPeriodicidad}
                />
                {periodicidad === 'custom' && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                    Cada
                    <input
                      type="number"
                      min={2}
                      aria-label="Cada cuántos días"
                      value={form.frecuenciaDias > 1 ? form.frecuenciaDias : 2}
                      onChange={(e) => setForm((f) => ({ ...f, frecuenciaDias: Number(e.target.value) }))}
                      className={cn(fieldCls, 'w-20 text-right')}
                    />
                    días
                  </div>
                )}
                {periodicidad === 'semanal' && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS.map((d) => {
                        const on = form.diaSemana.split(/\s+/).includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleDia(d)}
                            className={cn(
                              'h-8 w-9 rounded-r-pastilla border tabular-nums text-xs font-semibold transition-colors duration-150 active:scale-[0.97]',
                              on ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-muted hover:border-gold',
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      Cada
                      <input
                        type="number"
                        min={1}
                        aria-label="Cada cuántas semanas"
                        value={form.apareceDia > 0 ? form.apareceDia : 1}
                        onChange={(e) => setForm((f) => ({ ...f, apareceDia: Number(e.target.value) }))}
                        className={cn(fieldCls, 'w-20 text-right')}
                      />
                      semana(s)
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, acumula: !f.acumula }))}
                aria-pressed={form.acumula}
                className={cn(
                  'w-full rounded-r-medio border p-3 text-left transition-colors duration-150',
                  form.acumula ? 'border-exito-line bg-exito-soft' : 'border-line bg-paper/60',
                )}
              >
                <div className={cn('text-sm font-semibold', form.acumula ? 'text-exito-deep' : 'text-ink')}>
                  {form.acumula ? '✓ ' : ''}Acumula si no se realiza
                  <span className="ml-1 text-micro font-normal text-muted">(arrastre de pendientes)</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Si el turno termina y no fue marcada como realizada, reaparece resaltada como
                  pendiente en el próximo turno en que aplique. Ideal para tareas críticas que no se
                  pueden saltar (p. ej. conteo de caja).
                </p>
              </button>
            </>
          )}

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
        title="¿Eliminar actividad?"
        icon={<AlertTriangle className="h-5 w-5 shrink-0 text-aviso" strokeWidth={2} aria-hidden />}
      >
        <ModalBody>
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{eliminar?.nombre}</span> ({eliminar?.cod}) se quita
            del catálogo de esta sede. Los reportes ya enviados no cambian.
          </p>
          {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setEliminar(null)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button
            type="button"
            onClick={confirmarEliminar}
            pending={pending}
            className="bg-error hover:bg-error-deep"
          >
            {pending ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Modal duplicar de sede ── */}
      <Modal
        open={duplicarAbierto}
        onClose={() => !pending && setDuplicarAbierto(false)}
        size="sm"
        title={`Duplicar catálogo hacia ${sedes.find((s) => s.cod === sede)?.nombre ?? sede}`}
        subtitle="Copia las actividades que aún no existan aquí"
      >
        <ModalBody className="space-y-3">
          <div>
            <label htmlFor="dup-desde" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Copiar desde
            </label>
            <select id="dup-desde" value={duplicarDe} onChange={(e) => setDuplicarDe(e.target.value)} className={cn(fieldCls, 'w-full')}>
              {sedes.filter((s) => s.cod !== sede).map((s) => (
                <option key={s.cod} value={s.cod}>
                  {s.nombre} ({s.cod})
                </option>
              ))}
            </select>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setDuplicarAbierto(false)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={duplicar} disabled={!duplicarDe} pending={pending}>
            {pending ? 'Copiando…' : 'Duplicar'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
