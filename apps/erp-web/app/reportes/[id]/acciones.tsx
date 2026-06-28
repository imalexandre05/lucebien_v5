'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { calcularPuntajeEval } from '@scilb/core';
import { accionEvaluar, accionAnular, accionAnularEval } from '../actions';
import { Card, CardContent } from '../../../components/ui/card';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

type ActEval = { cod: string; nombre: string; peso: number; calificacion: number | null };

const OPCIONES = [
  { v: 1, label: 'Perfecto' },
  { v: 0.75, label: 'Bien' },
  { v: 0.5, label: 'Regular' },
  { v: 0.25, label: 'Mal' },
  { v: 0, label: 'No hecho' },
];

const fieldCls =
  'rounded-md border border-line bg-white px-2 py-1 text-xs text-navy outline-none transition-colors focus:border-gold';

export function EvaluarPanel({ id, actividades }: { id: string; actividades: ActEval[] }) {
  const router = useRouter();
  const [cal, setCal] = useState<Record<string, number>>(() =>
    Object.fromEntries(actividades.map((a) => [a.cod, a.calificacion ?? 1])),
  );
  const [obs, setObs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const puntaje = useMemo(
    () => calcularPuntajeEval(actividades.map((a) => ({ peso: a.peso, calificacion: cal[a.cod] ?? 1 }))),
    [actividades, cal],
  );

  function enviar() {
    setError('');
    startTransition(async () => {
      const r = await accionEvaluar(
        id,
        actividades.map((a) => ({ cod: a.cod, cal: cal[a.cod] ?? 1, obs: obs[a.cod] ?? '' })),
      );
      if (!r.ok) {
        setError(r.error ?? 'Error al evaluar');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">Evaluar reporte</h2>
        <span className="font-mono text-sm font-bold tabular-nums text-[#7a6e0e]">{puntaje}%</span>
      </div>
      <Card>
        <CardContent className="divide-y divide-line/60 px-0 py-0">
          {actividades.map((a) => (
            <div key={a.cod} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm text-navy">{a.nombre}</span>
              <select
                value={cal[a.cod] ?? 1}
                onChange={(e) => setCal((p) => ({ ...p, [a.cod]: Number(e.target.value) }))}
                className={fieldCls}
                aria-label={`Calificación ${a.cod}`}
              >
                {OPCIONES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                value={obs[a.cod] ?? ''}
                onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                placeholder="Obs. de evaluación"
                className={cn(fieldCls, 'w-48')}
              />
            </div>
          ))}
          {actividades.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted">Este reporte no tiene actividades para evaluar.</div>
          )}
        </CardContent>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={enviar}
        disabled={pending || actividades.length === 0}
        className={cn(buttonVariants({ variant: 'primary' }), 'mt-3', pending && 'opacity-60')}
      >
        {pending ? 'Enviando…' : `Enviar evaluación · ${puntaje}%`}
      </button>
    </div>
  );
}

export function AccionesAdmin({ id, evaluado }: { id: string; evaluado: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function anular() {
    if (!confirm('¿Anular este reporte? Se borran sus actividades, trabajadores y extras.')) return;
    startTransition(async () => {
      const r = await accionAnular(id);
      if (r.ok) router.push('/reportes');
      else alert(r.error);
    });
  }

  function anularEval() {
    if (!confirm('¿Anular la evaluación? El reporte vuelve a quedar pendiente.')) return;
    startTransition(async () => {
      const r = await accionAnularEval(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
      <span className="text-xs uppercase tracking-wide text-muted">Admin</span>
      {evaluado && (
        <button type="button" onClick={anularEval} disabled={pending} className={buttonVariants({ variant: 'outline' })}>
          Anular evaluación
        </button>
      )}
      <button
        type="button"
        onClick={anular}
        disabled={pending}
        className={cn(buttonVariants({ variant: 'outline' }), 'border-red-300 text-red-600 hover:bg-red-50')}
      >
        Anular reporte
      </button>
    </div>
  );
}
