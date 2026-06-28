'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Moon, Clock, Check, Square, Plus, Trash2 } from 'lucide-react';
import { idReporte, type TurnoReporte } from '@scilb/core';
import { iniciarTurno, accionCrearReporte, accionGuardarDraft } from '../actions';
import type { ActividadDelTurno } from '../../../lib/reportes-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

type Emp = { id: string; nombre: string };
type Extra = { tipo: string; nombre: string; cantidad: number; monto: number };

const TURNOS: { v: TurnoReporte; label: string; icon: typeof Sun }[] = [
  { v: 'M', label: 'Mañana', icon: Sun },
  { v: 'T', label: 'Tarde', icon: Moon },
  { v: 'C', label: 'Completo', icon: Clock },
];

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

export function NuevoReporteForm({
  sede,
  fecha,
  encargadoId,
  encargadoNombre,
  empleados,
}: {
  sede: string;
  fecha: string;
  encargadoId: string | null;
  encargadoNombre: string;
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
  const [buscarTrab, setBuscarTrab] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!turno) {
      setCat([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    setError('');
    iniciarTurno(sede, fecha, turno)
      .then(({ actividades, draft }) => {
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
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar el turno');
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [turno, sede, fecha]);

  const actDone = useMemo(() => cat.filter((a) => done[a.cod]).length, [cat, done]);
  const trabSel = useMemo(() => new Set(trabajadores), [trabajadores]);
  const empleadosFiltrados = useMemo(() => {
    const q = buscarTrab.trim().toLowerCase();
    return q ? empleados.filter((e) => e.nombre.toLowerCase().includes(q)) : empleados;
  }, [empleados, buscarTrab]);

  // Autosave (debounce 1.2s).
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

  function marcarTodas(valor: boolean) {
    setDone(Object.fromEntries(cat.map((a) => [a.cod, valor])));
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
    <div className="max-w-3xl space-y-4">
      {/* ── Información General ── */}
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
          <Badge tone="gold">Sin enviar</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Turno</label>
            <div className="flex gap-2">
              {TURNOS.map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTurno(v)}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                    turno === v ? 'border-navy bg-navy text-paper' : 'border-line bg-white text-navy hover:border-gold',
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 font-mono text-xs text-muted">
              {sede} · {fecha}
            </p>
          </div>

          {turno && (
            <div className="border-t border-line/60 pt-3">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted">Equipo del turno</label>
              <p className="mb-2 text-sm text-navy">
                Encargado: <span className="font-medium">{encargadoNombre}</span>
                <span className="ml-1 text-xs text-muted">(quien firma el reporte)</span>
              </p>
              <input
                value={buscarTrab}
                onChange={(e) => setBuscarTrab(e.target.value)}
                placeholder="Buscar colaborador…"
                className={cn(fieldCls, 'mb-2 w-full')}
              />
              <div className="flex flex-wrap gap-1.5">
                {empleadosFiltrados.map((e) => {
                  const on = trabSel.has(e.id);
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
                {empleadosFiltrados.length === 0 && <span className="text-xs text-muted">Sin coincidencias.</span>}
              </div>
              <p className="mt-1.5 text-xs text-muted">{trabajadores.length} colaborador(es) seleccionado(s)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!turno && <p className="text-sm text-muted">Selecciona un turno para cargar las actividades del día.</p>}
      {cargando && <p className="text-sm text-muted">Cargando actividades…</p>}

      {turno && !cargando && (
        <>
          {/* ── Actividades del Turno ── */}
          <Card>
            <CardHeader>
              <CardTitle>Actividades del turno</CardTitle>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted tabular-nums">
                  {actDone}/{cat.length}
                </span>
                <button
                  type="button"
                  onClick={() => marcarTodas(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-navy hover:border-gold"
                >
                  <Check className="h-3 w-3" strokeWidth={2} /> Todas
                </button>
                <button
                  type="button"
                  onClick={() => marcarTodas(false)}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-gold"
                >
                  <Square className="h-3 w-3" strokeWidth={2} /> Ninguna
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Cód.</TH>
                    <TH>Actividad</TH>
                    <TH>Cat.</TH>
                    <TH className="text-center">Hecho</TH>
                    <TH className="pr-5">Observación</TH>
                  </TR>
                </THead>
                <TBody>
                  {cat.map((a) => (
                    <TR key={a.cod}>
                      <TD className="pl-5 font-mono text-xs">{a.cod}</TD>
                      <TD>
                        {a.nombre}
                        {a.pendienteAcumulado && (
                          <Badge tone="amber" className="ml-2">
                            pendiente
                          </Badge>
                        )}
                      </TD>
                      <TD className="font-mono text-xs text-muted">{a.categoria ?? '—'}</TD>
                      <TD className="text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(done[a.cod])}
                          onChange={(e) => setDone((p) => ({ ...p, [a.cod]: e.target.checked }))}
                          className="h-4 w-4 accent-navy"
                        />
                      </TD>
                      <TD className="pr-5">
                        <input
                          value={obs[a.cod] ?? ''}
                          onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                          placeholder="—"
                          className={cn(fieldCls, 'w-full text-xs')}
                        />
                      </TD>
                    </TR>
                  ))}
                  {cat.length === 0 && (
                    <TR>
                      <TD className="px-5 py-6 text-center text-muted" colSpan={5}>
                        No hay actividades configuradas para este turno.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Actividades Extras ── */}
          <Card>
            <CardHeader>
              <CardTitle>Extras</CardTitle>
              <button
                type="button"
                onClick={() => setExtras((p) => [...p, { tipo: '', nombre: '', cantidad: 1, monto: 0 }])}
                className="inline-flex items-center gap-1 text-xs text-navy hover:text-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
              </button>
            </CardHeader>
            <CardContent>
              {extras.length === 0 ? (
                <p className="text-xs text-muted">Sin extras registrados.</p>
              ) : (
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
            </CardContent>
          </Card>

          {/* ── Resumen + Envío ── */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen del reporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-navy/15 bg-navy/5 p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Actividades</div>
                  <div className="font-mono text-lg font-bold tabular-nums text-navy">
                    {actDone}/{cat.length}
                  </div>
                  <div className="text-[10px] text-muted">completadas</div>
                </div>
                <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Equipo</div>
                  <div className="font-mono text-lg font-bold tabular-nums text-[#7a6e0e]">{trabajadores.length}</div>
                  <div className="text-[10px] text-muted">colaboradores</div>
                </div>
                <div className="rounded-lg border border-navy/15 bg-navy/5 p-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Extras</div>
                  <div className="font-mono text-lg font-bold tabular-nums text-navy">
                    {extras.filter((e) => e.nombre.trim()).length}
                  </div>
                  <div className="text-[10px] text-muted">registrados</div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className={cn(buttonVariants({ variant: 'primary' }), 'flex-1 justify-center', pending && 'opacity-60')}
                >
                  {pending ? 'Enviando…' : 'Enviar reporte'}
                </button>
                <span className="text-xs text-muted">Se guarda automáticamente mientras lo completas.</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
