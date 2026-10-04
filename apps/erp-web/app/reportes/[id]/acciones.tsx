'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, X, Star, AlertTriangle } from 'lucide-react';
import { calcularPuntajeEval, type TurnoReporte } from '@scilb/core';
import { accionEvaluar, accionAnular, accionAnularEval } from '../actions';
import type { LayoutZona } from '../../../lib/reportes-repo';
import { LayoutMap } from '../layout-map';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge, type Tone } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../../components/ui/modal';
import { Aviso } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

type ActEval = { cod: string; nombre: string; cat: string | null; peso: number; calificacion: number | null };
type ZonaEval = { zoneCod: string; peso: number; calificacion: number | null };

function catTone(cat: string | null): Tone {
  const c = (cat ?? '').toUpperCase();
  if (c.startsWith('IND') || c.includes('INDISP')) return 'green';
  if (c.startsWith('A') || c.includes('PRIMER') || c === '1') return 'navy';
  return 'gray';
}

// Control de 3 estados: ✓ aprobar (×1) · 👁 observar (×0.5) · ✗ rechazar (×0). Espeja el viejo.
function Estado3({
  value,
  onChange,
  nombre,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  nombre?: string;
}) {
  const opts: { v: number; Icon: typeof Check; on: string; label: string }[] = [
    { v: 1, Icon: Check, on: 'bg-exito text-white', label: 'Aprobar' },
    { v: 0.5, Icon: Eye, on: 'bg-aviso text-white', label: 'Observar' },
    { v: 0, Icon: X, on: 'bg-error text-white', label: 'Rechazar' },
  ];
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-r-chico border border-line">
      {opts.map((o) => {
        const active = value === o.v;
        const Icon = o.Icon;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            aria-label={nombre ? `${o.label} — ${nombre}` : o.label}
            title={o.label}
            className={cn(
              // 44px de alto y 52 de ancho: el mínimo táctil del sistema (spec §3.11). Antes eran
              // 40x44 y, con tres botones pegados, elegir "observar" sin darle a "aprobar" pedía
              // puntería. El hundido al presionar confirma el toque donde no hay hover.
              'anillo flex h-11 w-[52px] items-center justify-center border-l border-line transition-[background-color,color,transform] duration-150 first:border-l-0 focus-visible:z-10 active:scale-[0.94]',
              active ? o.on : 'bg-white text-muted hover:bg-paper hover:text-navy',
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>
        );
      })}
    </div>
  );
}

// `layout_zonas` no tiene único por (sede, código): un reporte puede traer dos filas con el mismo
// código. La RPC exige un `cal` por código y actualiza todas las filas que lo comparten.
function sinRepetidos<T>(items: T[], clave: (x: T) => string): T[] {
  const vistos = new Set<string>();
  return items.filter((x) => {
    const k = clave(x);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export function EvaluarPanel({
  id,
  actividades: actividadesProp,
  limpieza: limpiezaProp = [],
  zonas = [],
  turno,
  trabajadores = [],
}: {
  id: string;
  actividades: ActEval[];
  limpieza?: ZonaEval[];
  zonas?: LayoutZona[];
  turno: TurnoReporte;
  trabajadores?: string[];
}) {
  const router = useRouter();
  const actividades = useMemo(() => sinRepetidos(actividadesProp, (a) => a.cod), [actividadesProp]);
  const limpieza = useMemo(() => sinRepetidos(limpiezaProp, (z) => z.zoneCod), [limpiezaProp]);
  // Arrancan vacías a propósito. `reporte_actividades.calificacion` vale 1 por defecto en la base,
  // así que lo que llega en `a.calificacion` de un reporte sin evaluar no es una decisión de nadie:
  // el evaluador marca cada actividad y cada zona (reportes_evaluar exige todas, migración 0113).
  const [cal, setCal] = useState<Record<string, number>>({});
  const [estLimp, setEstLimp] = useState<Record<string, number>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const puntaje = useMemo(
    () =>
      calcularPuntajeEval([
        // Lo pendiente suma 0 y su peso sí cuenta: el puntaje sólo sube con lo que se aprueba.
        ...actividades.map((a) => ({ peso: a.peso, calificacion: cal[a.cod] ?? 0 })),
        ...limpieza.map((z) => ({ peso: z.peso, calificacion: estLimp[z.zoneCod] ?? 0 })),
      ]),
    [actividades, limpieza, cal, estLimp],
  );
  // El mapa sólo dibuja zonas del turno que existen hoy en el layout; el reporte puede traer otras
  // (código borrado, otro turno, tipo `area`). Toda zona sin marcar se lista aparte para que nunca
  // quede una pendiente sin forma de marcarla.
  const zonasPendientes = limpieza.filter((z) => estLimp[z.zoneCod] === undefined);
  const pendientes = actividades.filter((a) => cal[a.cod] === undefined).length + zonasPendientes.length;

  function masivoActs(v: number) {
    setCal(Object.fromEntries(actividades.map((a) => [a.cod, v])));
  }
  function masivoLimp(v: number) {
    setEstLimp(Object.fromEntries(limpieza.map((z) => [z.zoneCod, v])));
  }
  function ciclarZona(zoneCod: string) {
    setEstLimp((p) => {
      const cur = p[zoneCod];
      const next = cur === undefined ? 1 : cur >= 1 ? 0.5 : cur >= 0.5 ? 0 : 1;
      return { ...p, [zoneCod]: next };
    });
  }

  function enviar() {
    setError('');
    if (pendientes > 0) {
      setError(`Faltan ${pendientes} por marcar: aprueba, observa o rechaza cada una antes de enviar.`);
      return;
    }
    startTransition(async () => {
      const r = await accionEvaluar(id, [
        ...actividades.map((a) => ({ cod: a.cod, cal: cal[a.cod], obs: obs[a.cod] ?? '' })),
        ...limpieza.map((z) => ({ cod: `OL_${z.zoneCod}`, cal: estLimp[z.zoneCod], obs: '' })),
      ]);
      if (!r.ok) {
        setError(r.error ?? 'Error al evaluar');
        return;
      }
      // Al evaluar, el evaluador pasa directo a su propio reporte de turno (como el viejo).
      router.push('/reportes/nuevo');
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-seccion font-display font-semibold text-navy">
          <Star className="h-5 w-5 text-gold" strokeWidth={2} /> Evaluar reporte
        </h2>
        {/* El puntaje se mueve con cada zona o actividad que se aprueba, observa o rechaza, y
            está lejos del clic: sin señal, no se nota que cambió. `key={puntaje}` re-monta el
            nodo para que el destello vuelva a correr en cada cambio, no sólo al montar. */}
        <span
          key={puntaje}
          className="animate-destello-valor rounded-r-pastilla bg-gold/15 px-3 py-1 tabular-nums text-base font-bold text-gold-deep"
        >
          {puntaje}%
        </span>
      </div>

      {trabajadores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-r-chico border border-aviso-line bg-aviso-soft px-3 py-2 text-cuerpo text-aviso-deep">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>El evaluante no puede haber estado en el turno:</span>
          {trabajadores.map((t) => (
            <span key={t} className="rounded-r-pastilla bg-white px-2 py-0.5 text-apoyo font-medium text-aviso-deep">
              {t}
            </span>
          ))}
        </div>
      )}

      {zonas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Limpieza</CardTitle>
            <span className="text-apoyo text-muted">Clic en cada zona para aprobar / observar / rechazar</span>
          </CardHeader>
          <CardContent>
            <LayoutMap
              zonas={zonas}
              turno={turno}
              selected={[]}
              modo="eval"
              estados={estLimp}
              onCycle={ciclarZona}
              onMass={masivoLimp}
              panelEval
            />
          </CardContent>
        </Card>
      )}

      {zonasPendientes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Zonas de limpieza sin marcar</CardTitle>
            <span className="text-apoyo text-muted">{zonasPendientes.length} pendientes</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {zonasPendientes.map((z) => {
              const nombre = zonas.find((x) => x.cod === z.zoneCod)?.nombre || z.zoneCod;
              return (
                <div key={z.zoneCod} className="flex flex-wrap items-center gap-3 rounded-r-chico border border-line bg-white px-3 py-2.5">
                  <span className="w-16 shrink-0 tabular-nums text-dato text-muted">{z.zoneCod}</span>
                  <span className="min-w-0 flex-1 text-cuerpo font-medium text-navy">{nombre}</span>
                  <Estado3 value={undefined} onChange={(v) => setEstLimp((p) => ({ ...p, [z.zoneCod]: v }))} nombre={nombre} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Calificación por actividad</CardTitle>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => masivoActs(1)} aria-label="Aprobar todo" className="inline-flex items-center gap-1 rounded-r-pastilla border border-exito-line bg-exito-soft px-2.5 py-1.5 text-apoyo font-medium text-exito-deep transition-colors duration-150 hover:bg-exito-soft active:scale-[0.97]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
            <button type="button" onClick={() => masivoActs(0.5)} aria-label="Observar todo" className="inline-flex items-center gap-1 rounded-r-pastilla border border-aviso-line bg-aviso-soft px-2.5 py-1.5 text-apoyo font-medium text-aviso-deep transition-colors duration-150 hover:bg-aviso-soft active:scale-[0.97]">
              <Eye className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
            <button type="button" onClick={() => masivoActs(0)} aria-label="Rechazar todo" className="inline-flex items-center gap-1 rounded-r-pastilla border border-error-line bg-error-soft px-2.5 py-1.5 text-apoyo font-medium text-error-deep transition-colors duration-150 hover:bg-error-soft active:scale-[0.97]">
              <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {actividades.map((a) => (
            <div key={a.cod} className="flex flex-wrap items-center gap-3 rounded-r-chico border border-line bg-white px-3 py-2.5">
              <span className="w-12 shrink-0 tabular-nums text-dato text-muted">{a.cod}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-cuerpo font-medium text-navy">{a.nombre}</span>
                  {a.peso > 0 && <span className="tabular-nums text-micro text-muted">{a.peso}pts</span>}
                </div>
              </div>
              {a.cat && <Badge tone={catTone(a.cat)}>{a.cat}</Badge>}
              <input
                value={obs[a.cod] ?? ''}
                onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                placeholder="Obs."
                aria-label={`Observación de ${a.nombre}`}
                className="w-40 rounded-r-chico border border-line bg-white px-2.5 py-2 text-apoyo text-navy outline-none transition-colors focus:border-gold"
              />
              <Estado3 value={cal[a.cod]} onChange={(v) => setCal((p) => ({ ...p, [a.cod]: v }))} nombre={a.nombre} />
            </div>
          ))}
          {actividades.length === 0 && (
            <p className="py-6 text-center text-cuerpo text-muted">Este reporte no tiene actividades para evaluar.</p>
          )}
        </CardContent>
      </Card>

      {error && <Aviso tono="error" className="text-cuerpo">{error}</Aviso>}

      {/* `gold` y no el navy primario: esto CIERRA la evaluación — es uno de los cuatro momentos
          de cierre del sistema (spec §6), y el oro es el color que la casa usa para eso. Además,
          el bloque entero de evaluar ya es dorado y verde: el navy plano se leía como un botón
          secundario justo en la acción principal de la pantalla. */}
      <Button
        type="button"
        variant="gold"
        data-testid="enviar-evaluacion"
        onClick={enviar}
        disabled={(actividades.length === 0 && limpieza.length === 0) || pendientes > 0}
        pending={pending}
        className="w-full justify-center py-3 text-sub font-semibold shadow-elev-1"
      >
        {pending
          ? 'Enviando…'
          : pendientes > 0
            ? `Faltan ${pendientes} por marcar`
            : `Enviar evaluación · ${puntaje}%`}
      </Button>
    </div>
  );
}

export function AccionesAdmin({ id, evaluado }: { id: string; evaluado: boolean }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<'reporte' | 'eval' | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Confirmación con el Modal compartido (§4G): mismo overlay/curva que Caja,
  // en lugar del confirm()/alert() nativo.
  function ejecutar() {
    const accion = confirmar;
    if (!accion) return;
    setError('');
    startTransition(async () => {
      const r = accion === 'reporte' ? await accionAnular(id) : await accionAnularEval(id);
      if (!r.ok) {
        setError(r.error ?? 'Error al anular');
        return;
      }
      setConfirmar(null);
      // AccionesAdmin solo se monta para admin/dueno (ver [id]/page.tsx) — siempre tienen acceso
      // al historial, así que tras anular vuelven ahí (Fase 4: la lista se mudó a
      // /administracion/reportes, /reportes ya no es la lista).
      if (accion === 'reporte') router.push('/administracion/reportes');
      else router.refresh();
    });
  }

  function cerrar() {
    if (pending) return;
    setConfirmar(null);
    setError('');
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
      <span className="text-rotulo uppercase text-muted">Admin</span>
      {evaluado && (
        <button type="button" onClick={() => setConfirmar('eval')} disabled={pending} className={buttonVariants({ variant: 'outline' })}>
          Anular evaluación
        </button>
      )}
      <button
        type="button"
        data-testid="anular-reporte"
        onClick={() => setConfirmar('reporte')}
        disabled={pending}
        className={cn(buttonVariants({ variant: 'outline' }), 'border-error-line text-error hover:bg-error-soft')}
      >
        Anular reporte
      </button>

      <Modal
        open={confirmar !== null}
        onClose={cerrar}
        size="sm"
        title={confirmar === 'eval' ? '¿Anular la evaluación?' : '¿Anular este reporte?'}
        icon={<AlertTriangle className="h-5 w-5 shrink-0 text-aviso" strokeWidth={2} aria-hidden />}
      >
        <ModalBody>
          <p className="text-cuerpo leading-relaxed text-muted">
            {confirmar === 'eval'
              ? 'El reporte vuelve a quedar pendiente de evaluación.'
              : 'Se borran sus actividades, trabajadores y extras. Esta acción no se puede deshacer.'}
          </p>
          {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={cerrar} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button
            type="button"
            data-testid="confirmar-anular"
            onClick={ejecutar}
            pending={pending}
            className="bg-error hover:bg-error-deep"
          >
            {pending ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
