'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle, Plus, Trash2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { accionGuardarConfig, accionCrearParametroConfig, accionEliminarParametroConfig } from './actions';
import { ordenarSecciones, type ConfigItem, type ConfigTipo } from '../../lib/config-catalogo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { Badge } from '../../components/ui/badge';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';

const fieldCls = campoCls;

const TIPO_OPCIONES: Opcion<ConfigTipo>[] = [
  { value: 'numero', label: 'Número' },
  { value: 'booleano', label: 'Sí / No' },
  { value: 'lista', label: 'Lista' },
  { value: 'horario', label: 'Horario' },
  { value: 'color', label: 'Color' },
  { value: 'texto', label: 'Texto' },
];

// ── Control tipado por parámetro (Fase 13 tarea 1: "controles tipados — número, booleano,
// lista, color, horario" en vez del único <input> de texto que tenía la versión anterior). ──────
function ControlTipado({
  tipo,
  valor,
  opciones,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  tipo: ConfigTipo;
  valor: string;
  opciones?: string[];
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  switch (tipo) {
    case 'booleano':
      return (
        <OpcionBotones
          opciones={[
            { value: 'true', label: 'Sí' },
            { value: 'false', label: 'No' },
          ]}
          value={valor === 'false' ? 'false' : 'true'}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'lista':
      return (
        <OpcionBotones
          opciones={(opciones ?? []).map((o) => ({ value: o, label: o }))}
          value={valor}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'horario':
      return (
        <input
          type="time"
          value={valor}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldCls, 'w-32')}
        />
      );
    case 'color': {
      const hexValido = /^#[0-9a-f]{6}$/i.test(valor);
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={hexValido ? valor : '#2e3e6e'}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-white p-0.5 disabled:cursor-not-allowed"
            aria-label="Color"
          />
          <span className="font-mono text-xs text-muted">{valor || '—'}</span>
        </div>
      );
    }
    case 'numero':
      return (
        <input
          type="number"
          value={valor}
          min={min}
          max={max}
          step={step ?? 'any'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldCls, 'w-28 text-right')}
        />
      );
    default:
      return (
        <input
          value={valor}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldCls, 'w-40')}
        />
      );
  }
}

function ParametroFila({
  item,
  valor,
  onChange,
  onEliminar,
}: {
  item: ConfigItem;
  valor: string;
  onChange: (v: string) => void;
  onEliminar?: () => void;
}) {
  const modificado = item.default != null && valor !== item.default;
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-navy">{item.etiqueta}</span>
            {!item.guardado && (
              <Badge tone="amber" className="text-[10px]">
                valor por defecto
              </Badge>
            )}
          </div>
          {item.descripcion && <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted">{item.descripcion}</p>}
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted/70">
            {item.clave}
            {item.default != null && <span>· default: {item.default}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ControlTipado tipo={item.tipo} valor={valor} opciones={item.opciones} min={item.min} max={item.max} step={item.step} onChange={onChange} />
          {onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              aria-label={`Eliminar ${item.etiqueta}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-error-soft hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {modificado && (
        <button
          type="button"
          onClick={() => item.default != null && onChange(item.default)}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-navy"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2} /> Restaurar valor por defecto
        </button>
      )}
    </div>
  );
}

type FormNuevo = {
  clave: string;
  etiqueta: string;
  descripcion: string;
  seccion: string;
  tipo: ConfigTipo;
  valor: string;
  opciones: string[];
};
const VACIO: FormNuevo = { clave: '', etiqueta: '', descripcion: '', seccion: 'Personalizados', tipo: 'texto', valor: '', opciones: [] };

export function ConfigCliente({ items }: { items: ConfigItem[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.clave, i.valor])));
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState<FormNuevo>(VACIO);
  const [nuevaOpcion, setNuevaOpcion] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [eliminar, setEliminar] = useState<ConfigItem | null>(null);

  const secciones = useMemo(() => ordenarSecciones(items), [items]);

  function set(clave: string, valor: string) {
    setOk(false);
    setVals((p) => ({ ...p, [clave]: valor }));
  }

  function guardar() {
    setError('');
    setOk(false);
    startTransition(async () => {
      const r = await accionGuardarConfig(items.map((i) => ({ clave: i.clave, valor: vals[i.clave] ?? i.valor })));
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  function abrirNuevo() {
    setForm(VACIO);
    setNuevaOpcion('');
    setErrorModal('');
    setModalNuevo(true);
  }

  function agregarOpcion() {
    const v = nuevaOpcion.trim();
    if (!v || form.opciones.includes(v)) return;
    setForm((f) => ({ ...f, opciones: [...f.opciones, v] }));
    setNuevaOpcion('');
  }
  function quitarOpcion(v: string) {
    setForm((f) => ({ ...f, opciones: f.opciones.filter((o) => o !== v) }));
  }

  function crearParametro() {
    setErrorModal('');
    startTransition(async () => {
      const r = await accionCrearParametroConfig({
        clave: form.clave,
        valor: form.valor,
        tipo: form.tipo,
        seccion: form.seccion,
        descripcion: form.descripcion,
        opciones: form.tipo === 'lista' ? form.opciones : undefined,
      });
      if (!r.ok) {
        setErrorModal(r.error ?? 'Error');
        return;
      }
      setModalNuevo(false);
      router.refresh();
    });
  }

  function confirmarEliminar() {
    if (!eliminar) return;
    startTransition(async () => {
      const r = await accionEliminarParametroConfig(eliminar.clave);
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
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="flex items-center gap-2 text-sm text-muted">
            <SlidersHorizontal className="h-4 w-4 text-navy/50" strokeWidth={1.75} />
            {items.length} parámetro(s) · {secciones.length} sección(es)
          </p>
          <button type="button" onClick={abrirNuevo} className={buttonVariants({ variant: 'outline' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo parámetro
          </button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {secciones.map((s) => (
          <Card key={s.nombre}>
            <CardHeader>
              <CardTitle>{s.nombre}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-line/60 py-0">
              {s.items.map((i) => (
                <ParametroFila
                  key={i.clave}
                  item={i}
                  valor={vals[i.clave] ?? i.valor}
                  onChange={(v) => set(i.clave, v)}
                  onEliminar={i.esPersonalizado ? () => setEliminar(i) : undefined}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <p className="flex animate-fade items-center gap-1.5 text-sm text-error">
          <AlertCircle className="h-4 w-4" strokeWidth={2} /> {error}
        </p>
      )}
      {ok && (
        // `role="status"` y no un Aviso con caja: el acierto tiene que anunciarse —sin eso, con
        // lector de pantalla se guarda y no pasa nada audible— pero una confirmación al lado del
        // propio botón no necesita gritar. Anunciar todo con el mismo peso enseña a ignorarlo.
        <p role="status" className="flex animate-fade items-center gap-1.5 text-sm text-exito-deep">
          <Check className="h-4 w-4" strokeWidth={2.5} /> Cambios guardados.
        </p>
      )}

      <Button type="button" onClick={guardar} pending={pending}>
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      {/* ── Modal: nuevo parámetro ── */}
      <Modal open={modalNuevo} onClose={() => !pending && setModalNuevo(false)} size="lg" title="Nuevo parámetro">
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cfg-clave" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Clave interna *
              </label>
              <input
                id="cfg-clave"
                value={form.clave}
                onChange={(e) => setForm((f) => ({ ...f, clave: e.target.value }))}
                placeholder="mi_parametro"
                className={cn(fieldCls, 'w-full font-mono')}
              />
            </div>
            <div>
              <label htmlFor="cfg-seccion" className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Sección
              </label>
              <input
                id="cfg-seccion"
                value={form.seccion}
                onChange={(e) => setForm((f) => ({ ...f, seccion: e.target.value }))}
                placeholder="Personalizados"
                className={cn(fieldCls, 'w-full')}
              />
            </div>
          </div>
          <div>
            <label htmlFor="cfg-descripcion" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Descripción
            </label>
            <input
              id="cfg-descripcion"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              placeholder="Para qué sirve este parámetro"
              className={cn(fieldCls, 'w-full')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo de control</label>
            <OpcionBotones opciones={TIPO_OPCIONES} value={form.tipo} onChange={(tipo) => setForm((f) => ({ ...f, tipo, valor: '' }))} />
          </div>
          {form.tipo === 'lista' && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Opciones de la lista</label>
              <div className="flex gap-2">
                <input
                  value={nuevaOpcion}
                  onChange={(e) => setNuevaOpcion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      agregarOpcion();
                    }
                  }}
                  placeholder="ej. activo"
                  className={cn(fieldCls, 'flex-1')}
                />
                <button type="button" onClick={agregarOpcion} className={cn(buttonVariants({ variant: 'outline' }), 'text-xs')}>
                  Agregar
                </button>
              </div>
              {form.opciones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.opciones.map((o) => (
                    <span key={o} className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2.5 py-1 text-xs text-navy">
                      {o}
                      <button type="button" onClick={() => quitarOpcion(o)} aria-label={`Quitar ${o}`} className="text-muted hover:text-error">
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Valor inicial</label>
            <ControlTipado
              tipo={form.tipo}
              valor={form.valor}
              opciones={form.opciones}
              onChange={(v) => setForm((f) => ({ ...f, valor: v }))}
            />
          </div>
          {errorModal && <Aviso tono="error">{errorModal}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setModalNuevo(false)} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button type="button" onClick={crearParametro} pending={pending}>
            {pending ? 'Creando…' : 'Crear parámetro'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Modal: eliminar parámetro personalizado ── */}
      <Modal open={eliminar !== null} onClose={() => !pending && setEliminar(null)} size="sm" title="¿Eliminar parámetro?">
        <ModalBody>
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{eliminar?.etiqueta}</span> (
            <span className="font-mono text-xs">{eliminar?.clave}</span>) se borra de Configuración. Si algún código todavía lo lee, volverá a
            usar su propio valor por defecto interno.
          </p>
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
