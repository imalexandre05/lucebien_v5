'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Trash2 } from 'lucide-react';
import { TURNO_LABEL, idReporte, type TurnoReporte } from '@scilb/core';
import { iniciarTurno, accionCrearReporte, accionGuardarDraft } from '../actions';
import type { ActividadDelTurno } from '../../../lib/reportes-repo';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

type Emp = { id: string; nombre: string };
type Extra = { tipo: string; nombre: string; cantidad: number; monto: number };

const TURNOS: TurnoReporte[] = ['M', 'T', 'C'];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

export function NuevoReporteForm({
  sede,
  fecha,
  encargadoId,
  empleados,
}: {
  sede: string;
  fecha: string;
  encargadoId: string | null;
  empleados: Emp[];
}) {
  const router = useRouter();
  const [turno, setTurno] = useState<TurnoReporte | ''>('');
  const [cat, setCat] = useState<ActividadDelTurno[]>([]);
  const [cargando, setCargando] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [trabajadores, setTrabajadores] = useState<string[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Al elegir turno: cargar catálogo + draft. Por defecto todas marcadas (lo común es que se hagan).
  useEffect(() => {
    if (!turno) {
      setCat([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    setError('');
    iniciarTurno(sede, fecha, turno).then(({ actividades, draft }) => {
      if (!vivo) return;
      setCat(actividades);
      const d = (draft ?? {}) as {
        trabajadores?: string[];
        actividades?: { cod: string; realizada?: boolean; obs?: string }[];
        extras?: Extra[];
      };
      const prev = new Map((d.actividades ?? []).map((x) => [x.cod, x]));
      const initDone: Record<string, boolean> = {};
      const initObs: Record<string, string> = {};
      actividades.forEach((a) => {
        const p = prev.get(a.cod);
        initDone[a.cod] = p ? Boolean(p.realizada) : true;
        if (p?.obs) initObs[a.cod] = p.obs;
      });
      setDone(initDone);
      setObs(initObs);
      setTrabajadores(d.trabajadores ?? []);
      setExtras(d.extras ?? []);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [turno, sede, fecha]);

  const actDone = useMemo(() => cat.filter((a) => done[a.cod]).length, [cat, done]);

  // Autosave (debounce 1.2s) mientras se llena.
  const primeraVez = useRef(true);
  useEffect(() => {
    if (!turno || cargando) return;
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    const t = setTimeout(() => {
      accionGuardarDraft({
        sede,
        fecha,
        turno,
        encargadoId,
        payload: {
          trabajadores,
          actividades: cat.map((a) => ({
            cod: a.cod,
            nombre: a.nombre,
            cat: a.categoria,
            peso: a.peso,
            realizada: Boolean(done[a.cod]),
            obs: obs[a.cod] ?? '',
          })),
          extras,
        },
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [turno, cargando, sede, fecha, encargadoId, trabajadores, done, obs, extras, cat]);

  function toggleTrab(id: string) {
    setTrabajadores((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    if (!turno) return;
    const id = idReporte(fecha, turno, sede);
    const actividades = cat
      .filter((a) => done[a.cod])
      .map((a) => ({ cod: a.cod, nombre: a.nombre, cat: a.categoria, peso: a.peso, obs: obs[a.cod] ?? '' }));
    setError('');
    startTransition(async () => {
      const r = await accionCrearReporte({
        id,
        sede,
        turno,
        actTotal: cat.length,
        actDone: actividades.length,
        trabajadores,
        actividades,
        extras: extras
          .filter((e) => e.nombre.trim())
          .map((e) => ({
            tipo: e.tipo || 'extra',
            nombre: e.nombre,
            cantidad: e.cantidad || 1,
            precio_unitario: 0,
            monto_total: e.monto || 0,
            detalle: '',
          })),
      });
      if (!r.ok) {
        setError(r.error ?? 'Error al crear el reporte');
        return;
      }
      router.push(`/reportes/${r.id}`);
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Turno */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <span className="text-sm font-medium text-navy">Turno:</span>
          {TURNOS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTurno(t)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                turno === t ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-navy hover:border-gold',
              )}
            >
              {TURNO_LABEL[t]}
            </button>
          ))}
          <span className="ml-auto font-mono text-xs text-muted">
            {sede} · {fecha}
          </span>
        </CardContent>
      </Card>

      {!turno && (
        <p className="text-sm text-muted">Elegí un turno para cargar las actividades del día.</p>
      )}
      {cargando && <p className="text-sm text-muted">Cargando actividades…</p>}

      {turno && !cargando && (
        <>
          {/* Trabajadores */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-navy">Trabajadores del turno</h2>
            <div className="flex flex-wrap gap-1.5">
              {empleados.map((e) => {
                const on = trabajadores.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleTrab(e.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      on ? 'border-navy bg-navy/10 text-navy' : 'border-line bg-white text-muted hover:border-gold',
                    )}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={2.5} />}
                    {e.nombre}
                  </button>
                );
              })}
              {empleados.length === 0 && <span className="text-xs text-muted">Sin empleados visibles.</span>}
            </div>
          </section>

          {/* Actividades */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy">Actividades</h2>
              <span className="font-mono text-xs text-muted tabular-nums">
                {actDone}/{cat.length} hechas
              </span>
            </div>
            <Card>
              <CardContent className="divide-y divide-line/60 px-0 py-0">
                {cat.map((a) => (
                  <div key={a.cod} className="flex items-start gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={Boolean(done[a.cod])}
                      onChange={(e) => setDone((p) => ({ ...p, [a.cod]: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-navy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-navy">{a.nombre}</span>
                        {a.pendienteAcumulado && <Badge tone="amber">pendiente</Badge>}
                        <span className="ml-auto font-mono text-[10px] text-muted">{a.cod}</span>
                      </div>
                      <input
                        value={obs[a.cod] ?? ''}
                        onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                        placeholder="Observación (opcional)"
                        className={cn(fieldCls, 'mt-1 w-full text-xs')}
                      />
                    </div>
                  </div>
                ))}
                {cat.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-muted">
                    No hay actividades configuradas para este turno.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Extras */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy">Extras (opcional)</h2>
              <button
                type="button"
                onClick={() => setExtras((p) => [...p, { tipo: '', nombre: '', cantidad: 1, monto: 0 }])}
                className="inline-flex items-center gap-1 text-xs text-navy hover:text-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
              </button>
            </div>
            {extras.length > 0 && (
              <div className="space-y-2">
                {extras.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={e.nombre}
                      onChange={(ev) => setExtras((p) => p.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))}
                      placeholder="Descripción"
                      className={cn(fieldCls, 'flex-1')}
                    />
                    <input
                      type="number"
                      value={e.cantidad}
                      onChange={(ev) => setExtras((p) => p.map((x, j) => (j === i ? { ...x, cantidad: Number(ev.target.value) } : x)))}
                      className={cn(fieldCls, 'w-20')}
                      aria-label="Cantidad"
                    />
                    <input
                      type="number"
                      value={e.monto}
                      onChange={(ev) => setExtras((p) => p.map((x, j) => (j === i ? { ...x, monto: Number(ev.target.value) } : x)))}
                      className={cn(fieldCls, 'w-24')}
                      aria-label="Monto"
                    />
                    <button
                      type="button"
                      onClick={() => setExtras((p) => p.filter((_, j) => j !== i))}
                      className="text-muted hover:text-red-600"
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
            >
              {pending ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <span className="text-xs text-muted">Se guarda solo mientras lo llenás.</span>
          </div>
        </>
      )}
    </div>
  );
}
