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
  value: number;
  onChange: (v: number) => void;
  nombre?: string;
}) {
  const opts: { v: number; Icon: typeof Check; on: string; label: string }[] = [
    { v: 1, Icon: Check, on: 'bg-exito text-white', label: 'Aprobar' },
    { v: 0.5, Icon: Eye, on: 'bg-aviso text-white', label: 'Observar' },
    { v: 0, Icon: X, on: 'bg-error text-white', label: 'Rechazar' },
  ];
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-line">
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
              'flex h-10 w-11 items-center justify-center border-l border-line outline-none transition-colors duration-150 first:border-l-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70',
              active ? o.on : 'bg-white text-muted hover:bg-paper',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.5} />
          </button>
        );
      })}
    </div>
  );
}

export function EvaluarPanel({
  id,
  actividades,
  limpieza = [],
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
  const [cal, setCal] = useState<Record<string, number>>(() =>
    Object.fromEntries(actividades.map((a) => [a.cod, a.calificacion ?? 1])),
  );
  const [estLimp, setEstLimp] = useState<Record<string, number>>(() =>
    Object.fromEntries(limpieza.map((z) => [z.zoneCod, z.calificacion ?? 1])),
  );
  const [obs, setObs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const puntaje = useMemo(
    () =>
      calcularPuntajeEval([
        ...actividades.map((a) => ({ peso: a.peso, calificacion: cal[a.cod] ?? 1 })),
        ...limpieza.map((z) => ({ peso: z.peso, calificacion: estLimp[z.zoneCod] ?? 1 })),
      ]),
    [actividades, limpieza, cal, estLimp],
  );

  function masivoActs(v: number) {
    setCal(Object.fromEntries(actividades.map((a) => [a.cod, v])));
  }
  function masivoLimp(v: number) {
    setEstLimp(Object.fromEntries(limpieza.map((z) => [z.zoneCod, v])));
  }
  function ciclarZona(zoneCod: string) {
    setEstLimp((p) => {
      const cur = p[zoneCod] ?? 1;
      const next = cur >= 1 ? 0.5 : cur >= 0.5 ? 0 : 1;
      return { ...p, [zoneCod]: next };
    });
  }

  function enviar() {
    setError('');
    startTransition(async () => {
      const r = await accionEvaluar(id, [
        ...actividades.map((a) => ({ cod: a.cod, cal: cal[a.cod] ?? 1, obs: obs[a.cod] ?? '' })),
        ...limpieza.map((z) => ({ cod: `OL_${z.zoneCod}`, cal: estLimp[z.zoneCod] ?? 1, obs: '' })),
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
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <Star className="h-5 w-5 text-gold" strokeWidth={2} /> Evaluar reporte
        </h2>
        <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-base font-bold tabular-nums text-gold-deep">
          {puntaje}%
        </span>
      </div>

      {trabajadores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso-line bg-aviso-soft px-3 py-2 text-sm text-aviso-deep">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>El evaluante no puede haber estado en el turno:</span>
          {trabajadores.map((t) => (
            <span key={t} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-aviso-deep">
              {t}
            </span>
          ))}
        </div>
      )}

      {zonas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Limpieza</CardTitle>
            <span className="text-xs text-muted">Clic en cada zona para aprobar / observar / rechazar</span>
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

      <Card>
        <CardHeader>
          <CardTitle>Calificación por actividad</CardTitle>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => masivoActs(1)} aria-label="Aprobar todo" className="inline-flex items-center gap-1 rounded-md border border-exito-line bg-exito-soft px-2.5 py-1.5 text-xs font-medium text-exito-deep transition-colors duration-150 hover:bg-exito-soft active:scale-[0.97]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
            <button type="button" onClick={() => masivoActs(0.5)} aria-label="Observar todo" className="inline-flex items-center gap-1 rounded-md border border-aviso-line bg-aviso-soft px-2.5 py-1.5 text-xs font-medium text-aviso-deep transition-colors duration-150 hover:bg-aviso-soft active:scale-[0.97]">
              <Eye className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
            <button type="button" onClick={() => masivoActs(0)} aria-label="Rechazar todo" className="inline-flex items-center gap-1 rounded-md border border-error-line bg-error-soft px-2.5 py-1.5 text-xs font-medium text-error-deep transition-colors duration-150 hover:bg-error-soft active:scale-[0.97]">
              <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Todo
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {actividades.map((a) => (
            <div key={a.cod} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
              <span className="w-12 shrink-0 font-mono text-xs text-muted">{a.cod}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-navy">{a.nombre}</span>
                  {a.peso > 0 && <span className="font-mono text-[11px] text-muted">{a.peso}pts</span>}
                </div>
              </div>
              {a.cat && <Badge tone={catTone(a.cat)}>{a.cat}</Badge>}
              <input
                value={obs[a.cod] ?? ''}
                onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                placeholder="Obs."
                aria-label={`Observación de ${a.nombre}`}
                className="w-40 rounded-md border border-line bg-white px-2.5 py-2 text-xs text-navy outline-none transition-colors focus:border-gold"
              />
              <Estado3 value={cal[a.cod] ?? 1} onChange={(v) => setCal((p) => ({ ...p, [a.cod]: v }))} nombre={a.nombre} />
            </div>
          ))}
          {actividades.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">Este reporte no tiene actividades para evaluar.</p>
          )}
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-deep">{error}</p>}

      <Button
        type="button"
        data-testid="enviar-evaluacion"
        onClick={enviar}
        disabled={actividades.length === 0 && limpieza.length === 0}
        pending={pending}
        className="w-full justify-center py-3 text-base"
      >
        {pending ? 'Enviando…' : `Enviar evaluación · ${puntaje}%`}
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
      <span className="text-xs uppercase tracking-wide text-muted">Admin</span>
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
          <p className="text-sm leading-relaxed text-muted">
            {confirmar === 'eval'
              ? 'El reporte vuelve a quedar pendiente de evaluación.'
              : 'Se borran sus actividades, trabajadores y extras. Esta acción no se puede deshacer.'}
          </p>
          {error && <p className="mt-3 rounded-md bg-error-soft px-3 py-2 text-xs text-error-deep">{error}</p>}
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
