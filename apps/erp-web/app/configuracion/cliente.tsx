'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertCircle, Plus, Trash2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { accionGuardarConfig, accionCrearParametroConfig, accionEliminarParametroConfig } from './actions';
import {
  ordenarSecciones,
  SECCION_PAGO_PUNTOS,
  CLAVE_PUNTOS_META,
  CLAVE_SOLES_POR_PUNTO,
  type ConfigItem,
  type ConfigTipo,
} from '../../lib/config-catalogo';
import type { PromedioPuntos } from '../../lib/evaluaciones-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { Badge } from '../../components/ui/badge';
import { Aviso, campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';
import { DialogoConfirmar, useConfirmacion } from '../../components/ui/confirmar';
import { avisoComisionBaja, fraccionAPorcentaje, porcentajeAFraccion } from '../../lib/porcentaje';

const fieldCls = campoCls;

const TIPO_OPCIONES: Opcion<ConfigTipo>[] = [
  { value: 'numero', label: 'Número' },
  { value: 'booleano', label: 'Sí / No' },
  { value: 'lista', label: 'Lista' },
  { value: 'horario', label: 'Horario' },
  { value: 'color', label: 'Color' },
  { value: 'texto', label: 'Texto' },
];

// ── Un parámetro guardado como fracción que se escribe en porcentaje (hoy, la comisión) ────────
// Texto propio: si el campo mostrara `fraccionAPorcentaje(valor)` en cada render, «1.» se
// reescribiría a «1» mientras se tipea. Sólo se vuelve a armar desde `valor` cuando cambia desde
// afuera (p. ej. «Restaurar valor por defecto»). Spec 2026-10-03-comision-en-porcentaje.
const aTextoPorcentaje = (valor: string): string => {
  const n = Number(valor);
  return valor.trim() !== '' && Number.isFinite(n) ? fraccionAPorcentaje(n) : valor;
};

function CampoPorcentaje({
  valor,
  onChange,
  onInvalido,
  disabled,
}: {
  valor: string;
  onChange: (v: string) => void;
  onInvalido: (error: string | null) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState(() => aTextoPorcentaje(valor));
  const [error, setError] = useState<string | null>(null);
  const emitido = useRef(valor);
  const aviso = valor.trim() === '' ? null : avisoComisionBaja(Number(valor));

  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(aTextoPorcentaje(valor));
    setError(null);
    onInvalido(null);
    // onInvalido cambia de identidad en cada render del padre; sólo importa reaccionar a `valor`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const cambiar = (t: string) => {
    setTexto(t);
    const r = porcentajeAFraccion(t);
    const msg = r.ok ? null : r.error;
    setError(msg);
    onInvalido(msg);
    if (!r.ok) return;
    // Vacío viaja vacío: el servidor lo rechaza con su propio mensaje («no puede quedar vacío»).
    const nuevo = r.valor === null ? '' : String(r.valor);
    emitido.current = nuevo;
    onChange(nuevo);
  };

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => cambiar(e.target.value)}
          className={cn(fieldCls, 'w-24 text-right')}
        />
        <span className="text-cuerpo text-muted">%</span>
      </div>
      {error && <p className="mt-1 w-36 text-right text-micro text-error-deep">{error}</p>}
      {/* Spec 2026-10-03-comision-en-porcentaje §Aviso: entre 0 y 0,5 % se avisa, no se rechaza. */}
      {!error && aviso && <p className="mt-1 w-48 text-right text-micro text-aviso-deep">{aviso}</p>}
    </div>
  );
}

// ── Control tipado por parámetro (Fase 13 tarea 1: "controles tipados — número, booleano,
// lista, color, horario" en vez del único <input> de texto que tenía la versión anterior). ──────
function ControlTipado({
  tipo,
  valor,
  opciones,
  min,
  max,
  step,
  unidad,
  onChange,
  onInvalido,
  disabled,
}: {
  tipo: ConfigTipo;
  valor: string;
  opciones?: string[];
  min?: number;
  max?: number;
  step?: number;
  unidad?: 'porcentaje';
  onChange: (v: string) => void;
  /** Sólo lo usa un campo en porcentaje; el modal de parámetro nuevo no lo necesita. */
  onInvalido?: (error: string | null) => void;
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
            className="h-8 w-10 cursor-pointer rounded-r-chico border border-line bg-white p-0.5 disabled:cursor-not-allowed"
            aria-label="Color"
          />
          <span className="tabular-nums text-dato text-muted">{valor || '—'}</span>
        </div>
      );
    }
    case 'numero':
      if (unidad === 'porcentaje') {
        return <CampoPorcentaje valor={valor} onChange={onChange} onInvalido={onInvalido ?? (() => {})} disabled={disabled} />;
      }
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
  invalido,
  onChange,
  onInvalido,
  onEliminar,
}: {
  item: ConfigItem;
  valor: string;
  invalido: boolean;
  onChange: (v: string) => void;
  onInvalido: (error: string | null) => void;
  onEliminar?: () => void;
}) {
  // Un texto inválido también cuenta como modificado: si no, con el último valor válido igual al
  // default no aparecería «Restaurar» y la fila quedaría trabada.
  const modificado = item.default != null && (valor !== item.default || invalido);
  // Restaurar remonta el control: `CampoPorcentaje` sólo se resincroniza cuando `valor` cambia, y
  // restaurar al mismo valor que ya tenía no lo cambia.
  const [version, setVersion] = useState(0);
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-cuerpo font-medium text-navy">{item.etiqueta}</span>
            {!item.guardado && (
              <Badge tone="amber" className="text-micro">
                valor por defecto
              </Badge>
            )}
          </div>
          {item.descripcion && <p className="mt-0.5 max-w-xl text-apoyo leading-relaxed text-muted">{item.descripcion}</p>}
          <div className="mt-1 flex items-center gap-2 tabular-nums text-micro text-muted/70">
            {item.clave}
            {item.default != null && item.default !== '' && (
              <span>· default: {item.unidad === 'porcentaje' ? `${aTextoPorcentaje(item.default)} %` : item.default}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ControlTipado
            key={version}
            tipo={item.tipo}
            valor={valor}
            opciones={item.opciones}
            min={item.min}
            max={item.max}
            step={item.step}
            unidad={item.unidad}
            onChange={onChange}
            onInvalido={onInvalido}
          />
          {onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              aria-label={`Eliminar ${item.etiqueta}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-r-pastilla text-muted transition-colors duration-150 hover:bg-error-soft hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
      {modificado && (
        <button
          type="button"
          onClick={() => {
            if (item.default == null) return;
            onChange(item.default);
            onInvalido(null);
            setVersion((v) => v + 1);
          }}
          className="mt-1.5 flex items-center gap-1 text-micro text-muted underline decoration-dotted underline-offset-2 hover:text-navy"
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2} />{' '}
          {item.default === '' ? 'Dejar vacío (desactivar)' : 'Restaurar valor por defecto'}
        </button>
      )}
    </div>
  );
}

// Mismo formato que el motor (packages/core/src/sueldos.ts): 5000 → «5.000», 0.05 → «0,05».
const fmtNum = (n: number, dec = 2) => n.toLocaleString('es-PE', { maximumFractionDigits: dec });
const comoNumero = (v: string): number | null => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// Pago por puntos (spec sueldos/2026-10-05-pago-por-puntos-design.md §5). Tarjeta propia porque
// estos dos números sólo tienen sentido juntos y el dueño todavía no sabe qué poner: la tarjeta
// tiene que decirle qué hacen, si están encendidos, y con qué cifra real decidir la meta.
function TarjetaPagoPorPuntos({
  items,
  vals,
  onChange,
  invalidos,
  onInvalido,
  promedio,
}: {
  items: ConfigItem[];
  vals: Record<string, string>;
  onChange: (clave: string, v: string) => void;
  /** Los de #39: un número mal escrito bloquea guardar, también en esta tarjeta. */
  invalidos: Record<string, string>;
  onInvalido: (clave: string, msg: string | null) => void;
  promedio: PromedioPuntos | null;
}) {
  const meta = comoNumero(vals[CLAVE_PUNTOS_META] ?? '');
  const soles = comoNumero(vals[CLAVE_SOLES_POR_PUNTO] ?? '');
  const activo = meta !== null && soles !== null;
  const ejemploExtra = 1000;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{SECCION_PAGO_PUNTOS}</CardTitle>
        <Badge tone={activo ? 'green' : 'gray'}>{activo ? 'Activo' : 'Desactivado'}</Badge>
      </CardHeader>
      <CardContent className="py-0">
        <p className="pb-3 text-apoyo leading-relaxed text-muted">
          Además del sueldo, se paga un extra por los puntos que pasen de una meta mensual. Déjalos vacíos hasta decidir la meta: mientras
          estén vacíos no se paga por puntos y la liquidación no muestra la línea.
        </p>
        <p className="pb-3 text-apoyo leading-relaxed text-muted">
          Se copian a los contratos nuevos. Los contratos ya creados conservan los suyos: para que uno cobre por puntos, enciéndelo en sus
          valores pactados.
        </p>
        <div className="divide-y divide-line/60 border-t border-line/60">
          {items.map((i) => (
            <ParametroFila
              key={i.clave}
              item={i}
              valor={vals[i.clave] ?? i.valor}
              onChange={(v) => onChange(i.clave, v)}
              invalido={i.clave in invalidos}
              onInvalido={(msg) => onInvalido(i.clave, msg)}
            />
          ))}
        </div>
        <div className="space-y-1.5 border-t border-line/60 py-3 text-apoyo leading-relaxed text-muted">
          {promedio ? (
            <p>
              Para decidir la meta: en los últimos 30 días cada persona hizo en promedio{' '}
              <span className="tabular-nums font-semibold text-navy">{fmtNum(promedio.promedio)} puntos</span> ({promedio.personas} personas
              activas, del {promedio.desde} al {promedio.hasta}).
            </p>
          ) : (
            <p>No pude calcular el promedio de puntos de los últimos 30 días. Míralo en Evaluaciones antes de fijar la meta.</p>
          )}
          {activo ? (
            <p>
              Ejemplo: quien haga{' '}
              <span className="tabular-nums font-semibold text-navy">{fmtNum(meta + ejemploExtra, 0)} puntos</span> en el mes cobra{' '}
              <span className="tabular-nums font-semibold text-navy">S/ {fmtNum(ejemploExtra * soles)}</span> extra; quien no llegue a la
              meta no cobra nada por puntos.
            </p>
          ) : (
            meta !== null || soles !== null ? (
              <p className="text-aviso-deep">Falta uno de los dos: con uno solo no se paga por puntos.</p>
            ) : null
          )}
        </div>
      </CardContent>
    </Card>
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

export function ConfigCliente({ items, promedioPuntos = null }: { items: ConfigItem[]; promedioPuntos?: PromedioPuntos | null }) {
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
  // Parámetros con un texto que no se puede leer (hoy sólo los que se escriben en porcentaje). Con
  // alguno acá no se guarda: viajaría el valor anterior sin que nadie lo note.
  const [invalidos, setInvalidos] = useState<Record<string, string>>({});
  const confirmacion = useConfirmacion();

  function marcarInvalido(clave: string, msg: string | null) {
    setInvalidos((p) => {
      if (msg === null && !(clave in p)) return p;
      const resto = { ...p };
      delete resto[clave];
      return msg === null ? resto : { ...resto, [clave]: msg };
    });
  }

  const secciones = useMemo(() => ordenarSecciones(items), [items]);

  function set(clave: string, valor: string) {
    setOk(false);
    setVals((p) => ({ ...p, [clave]: valor }));
  }

  function guardar() {
    setError('');
    setOk(false);
    const malEscritos = items.filter((i) => i.clave in invalidos).map((i) => i.etiqueta);
    if (malEscritos.length > 0) {
      setError(`Revisa antes de guardar: ${malEscritos.join(', ')}.`);
      return;
    }
    // Una comisión CAMBIADA a menos de 0,5 % (y más de 0) pide confirmación: suele ser la unidad
    // vieja, `0.02` pensando en 2 %. Una que ya estaba guardada así no vuelve a preguntar.
    const bajo = items.find(
      (i) => i.unidad === 'porcentaje' && (vals[i.clave] ?? i.valor) !== i.valor && avisoComisionBaja(Number(vals[i.clave])),
    );
    if (bajo) {
      confirmacion.pedir({
        titulo: `¿«${bajo.etiqueta}» es correcta?`,
        detalle: avisoComisionBaja(Number(vals[bajo.clave])),
        confirmarLabel: 'Guardar igual',
        tono: 'aviso',
        alConfirmar: () => {
          confirmacion.cerrar();
          enviar();
        },
      });
      return;
    }
    enviar();
  }

  function enviar() {
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
          <p className="flex items-center gap-2 text-cuerpo text-muted">
            <SlidersHorizontal className="h-4 w-4 text-navy/50" strokeWidth={1.75} />
            {items.length} parámetro(s) · {secciones.length} sección(es)
          </p>
          <button type="button" onClick={abrirNuevo} className={buttonVariants({ variant: 'outline' })}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Nuevo parámetro
          </button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {secciones.map((s) =>
          s.nombre === SECCION_PAGO_PUNTOS ? (
            <TarjetaPagoPorPuntos
              key={s.nombre}
              items={s.items}
              vals={vals}
              onChange={set}
              invalidos={invalidos}
              onInvalido={marcarInvalido}
              promedio={promedioPuntos}
            />
          ) : (
            <Card key={s.nombre}>
              <CardHeader>
                <CardTitle>{s.nombre}</CardTitle>
                {/* Spec 2026-10-05-contrato-valores-pactados: cada contrato guarda sus propios valores. */}
                {s.nombre === 'Sueldos' && (
                  <p className="mt-1 text-apoyo text-muted">
                    Los valores de sueldo que también figuran como «Valores pactados» en cada contrato
                    (tolerancia, tardanzas, almuerzo, capacitación, meta, comisión, faltas, pausas) se
                    usan para los contratos <strong className="font-medium text-navy">nuevos</strong>. Los
                    contratos ya creados conservan los suyos. Los demás de esta sección (margen de horas,
                    métodos de pago y huellero) aplican a todos de inmediato.
                  </p>
                )}
              </CardHeader>
              <CardContent className="divide-y divide-line/60 py-0">
                {s.items.map((i) => (
                  <ParametroFila
                    key={i.clave}
                    item={i}
                    valor={vals[i.clave] ?? i.valor}
                    onChange={(v) => set(i.clave, v)}
                    invalido={i.clave in invalidos}
                    onInvalido={(msg) => marcarInvalido(i.clave, msg)}
                    onEliminar={i.esPersonalizado ? () => setEliminar(i) : undefined}
                  />
                ))}
              </CardContent>
            </Card>
          ),
        )}
      </div>

      {error && (
        <p className="flex animate-fade items-center gap-1.5 text-cuerpo text-error">
          <AlertCircle className="h-4 w-4" strokeWidth={2} /> {error}
        </p>
      )}
      {ok && (
        // `role="status"` y no un Aviso con caja: el acierto tiene que anunciarse —sin eso, con
        // lector de pantalla se guarda y no pasa nada audible— pero una confirmación al lado del
        // propio botón no necesita gritar. Anunciar todo con el mismo peso enseña a ignorarlo.
        <p role="status" className="flex animate-fade items-center gap-1.5 text-cuerpo text-exito-deep">
          <Check className="h-4 w-4" strokeWidth={2.5} /> Cambios guardados.
        </p>
      )}

      <Button type="button" onClick={guardar} pending={pending}>
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      <DialogoConfirmar {...confirmacion.props} pending={pending} />

      {/* ── Modal: nuevo parámetro ── */}
      <Modal open={modalNuevo} onClose={() => !pending && setModalNuevo(false)} size="lg" title="Nuevo parámetro">
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cfg-clave" className="mb-1 block text-rotulo uppercase text-muted">
                Clave interna *
              </label>
              <input
                id="cfg-clave"
                value={form.clave}
                onChange={(e) => setForm((f) => ({ ...f, clave: e.target.value }))}
                placeholder="mi_parametro"
                className={cn(fieldCls, 'w-full tabular-nums')}
              />
            </div>
            <div>
              <label htmlFor="cfg-seccion" className="mb-1 block text-rotulo uppercase text-muted">
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
            <label htmlFor="cfg-descripcion" className="mb-1 block text-rotulo uppercase text-muted">
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
            <label className="mb-1 block text-rotulo uppercase text-muted">Tipo de control</label>
            <OpcionBotones opciones={TIPO_OPCIONES} value={form.tipo} onChange={(tipo) => setForm((f) => ({ ...f, tipo, valor: '' }))} />
          </div>
          {form.tipo === 'lista' && (
            <div>
              <label className="mb-1 block text-rotulo uppercase text-muted">Opciones de la lista</label>
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
                <button type="button" onClick={agregarOpcion} className={cn(buttonVariants({ variant: 'outline' }), 'text-apoyo')}>
                  Agregar
                </button>
              </div>
              {form.opciones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.opciones.map((o) => (
                    <span key={o} className="inline-flex items-center gap-1 rounded-r-pastilla bg-navy/5 px-2.5 py-1 text-apoyo text-navy">
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
            <label className="mb-1 block text-rotulo uppercase text-muted">Valor inicial</label>
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
          <p className="text-cuerpo leading-relaxed text-muted">
            <span className="font-medium text-ink">{eliminar?.etiqueta}</span> (
            <span className="tabular-nums text-dato">{eliminar?.clave}</span>) se borra de Configuración. Si algún código todavía lo lee, volverá a
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
