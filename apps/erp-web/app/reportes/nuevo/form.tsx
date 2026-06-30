'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sun, Moon, Clock, Check, Square, Plus, Trash2, Send, Users, PenLine } from 'lucide-react';
import { idReporte, type TurnoReporte } from '@scilb/core';
import { iniciarTurno, accionCrearReporte, accionGuardarDraft } from '../actions';
import type { ActividadDelTurno, LayoutZona } from '../../../lib/reportes-repo';
import type { TipoIncidencia } from '../../../lib/incidencias-repo';
import { LayoutMap } from '../layout-map';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge, type Tone } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { PersonaPicker } from '../../../components/ui/persona-picker';
import { cn } from '../../../lib/cn';

type Emp = { id: string; nombre: string; rol: string; sedeCod: string | null };
type Extra = { tipo: string; nombre: string; cantidad: number; monto: number };
type IncRep = { tipo: string; nivel: string; descripcion: string; responsableId: string; puntosPenalidad: number };
const NIVELES_INC = ['Alto', 'Medio', 'Bajo'];

const TURNOS: { v: TurnoReporte; label: string; sub: string; icon: typeof Sun }[] = [
  { v: 'M', label: 'Mañana', sub: 'Turno AM', icon: Sun },
  { v: 'T', label: 'Tarde', sub: 'Turno PM', icon: Moon },
  { v: 'C', label: 'Completo', sub: 'Todo el día', icon: Clock },
];

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-2 text-sm text-navy outline-none transition-colors focus:border-gold';

// Pill de categoría de la actividad (espeja PRIMER ORDEN / 2° ORDEN / INDISPENSABLE del viejo).
function catTone(cat: string | null): Tone {
  const c = (cat ?? '').toUpperCase();
  if (c.startsWith('IND') || c.includes('INDISP')) return 'green';
  if (c.startsWith('A') || c.includes('PRIMER') || c === '1') return 'navy';
  return 'gray';
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 ease-out-expo',
        on ? 'bg-emerald-600' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-150 ease-out-expo',
          on ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function NuevoReporteForm({
  sede,
  fecha,
  encargadoId,
  empleados,
  tiposIncidencia,
}: {
  sede: string;
  fecha: string;
  encargadoId: string | null;
  empleados: Emp[];
  tiposIncidencia: TipoIncidencia[];
}) {
  const router = useRouter();
  const [turno, setTurno] = useState<TurnoReporte | ''>('');
  const [cat, setCat] = useState<ActividadDelTurno[]>([]);
  const [cargando, setCargando] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [trabajadores, setTrabajadores] = useState<string[]>([]);
  const [encargadoSel, setEncargadoSel] = useState<string[]>(encargadoId ? [encargadoId] : []);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [zonas, setZonas] = useState<LayoutZona[]>([]);
  const [limpieza, setLimpieza] = useState<string[]>([]);
  const [incidencias, setIncidencias] = useState<IncRep[]>([]);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Equipo: la propia sede aparece primero (como el hint del viejo).
  const empleadosOrden = useMemo(
    () =>
      [...empleados].sort((a, b) => {
        const sa = a.sedeCod === sede ? 0 : 1;
        const sb = b.sedeCod === sede ? 0 : 1;
        return sa - sb || a.nombre.localeCompare(b.nombre);
      }),
    [empleados, sede],
  );

  useEffect(() => {
    if (!turno) {
      setCat([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    setError('');
    iniciarTurno(sede, fecha, turno)
      .then(({ actividades, zonas, draft }) => {
        if (!vivo) return;
        setCat(actividades);
        setZonas(zonas);
        const d = (draft ?? {}) as {
          trabajadores?: string[];
          encargado?: string[];
          actividades?: { cod: string; realizada?: boolean; obs?: string }[];
          extras?: Extra[];
          limpieza?: string[];
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
        setEncargadoSel(d.encargado ?? (encargadoId ? [encargadoId] : []));
        setExtras(d.extras ?? []);
        setLimpieza(d.limpieza ?? []);
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
  }, [turno, sede, fecha, encargadoId]);

  const actDone = useMemo(() => cat.filter((a) => done[a.cod]).length, [cat, done]);
  const actPts = useMemo(() => cat.filter((a) => done[a.cod]).reduce((s, a) => s + a.peso, 0), [cat, done]);

  // Puntos de limpieza del turno (espeja el cálculo del LayoutMap).
  const limpiezaPts = useMemo(() => {
    const aplica = (zt: string) => {
      const z = (zt || 'ambos').toLowerCase();
      if (turno === 'C') return true;
      if (turno === 'M') return z === 'ambos' || z === 'mañana';
      if (turno === 'T') return z === 'ambos' || z === 'tarde';
      return true;
    };
    const puntuables = zonas.filter((z) => z.tipo !== 'area' && aplica(z.turno));
    const sel = new Set(limpieza);
    const tot = puntuables.reduce((s, z) => s + z.peso, 0);
    const got = puntuables.filter((z) => sel.has(z.cod)).reduce((s, z) => s + z.peso, 0);
    return { tot: Math.round(tot * 10) / 10, got: Math.round(got * 10) / 10 };
  }, [zonas, limpieza, turno]);

  const totalPts = Math.round((actPts + limpiezaPts.got) * 10) / 10;
  const puedeEnviar = Boolean(turno) && encargadoSel.length === 1 && !pending;

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
          encargado: encargadoSel,
          actividades: cat.map((a) => ({
            cod: a.cod,
            nombre: a.nombre,
            cat: a.categoria,
            peso: a.peso,
            realizada: Boolean(done[a.cod]),
            obs: obs[a.cod] ?? '',
          })),
          extras,
          limpieza,
        },
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [turno, cargando, sede, fecha, encargadoId, trabajadores, encargadoSel, done, obs, extras, cat, limpieza]);

  function marcarTodas(valor: boolean) {
    setDone(Object.fromEntries(cat.map((a) => [a.cod, valor])));
  }

  function submit() {
    if (!turno) return;
    if (encargadoSel.length !== 1) {
      setError('Selecciona al encargado del turno (quien firma el reporte).');
      return;
    }
    const id = idReporte(fecha, turno, sede);
    const actividades = cat
      .filter((a) => done[a.cod])
      .map((a) => ({ cod: a.cod, nombre: a.nombre, cat: a.categoria, peso: a.peso, obs: obs[a.cod] ?? '' }));
    // Zonas de limpieza marcadas → actividades OL_ (categoría IND), como en el sistema viejo.
    const limpiezaActs = zonas
      .filter((z) => z.tipo !== 'area' && limpieza.includes(z.cod))
      .map((z) => ({ cod: `OL_${z.cod}`, nombre: `Limpieza: ${z.nombre}`, cat: 'IND', peso: z.peso, obs: '' }));
    setError('');
    startTransition(async () => {
      const r = await accionCrearReporte({
        id,
        sede,
        fecha,
        turno,
        encargado: encargadoSel[0] ?? null,
        actTotal: cat.length,
        actDone: actividades.length,
        trabajadores,
        actividades: [...actividades, ...limpiezaActs],
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
        incidencias: incidencias
          .filter((i) => i.tipo)
          .map((i) => ({
            tipo: i.tipo,
            nivel: i.nivel,
            descripcion: i.descripcion,
            responsableId: i.responsableId || null,
            puntosPenalidad: i.puntosPenalidad,
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
    <div className="space-y-5">
      {/* ── Información General: turno + equipo ── */}
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
          <Badge tone="gold">Sin enviar</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">Turno</label>
            <div className="grid grid-cols-3 gap-3">
              {TURNOS.map(({ v, label, sub, icon: Icon }) => {
                const on = turno === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTurno(v)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-5 transition-[transform,background-color,border-color] duration-150 ease-out-expo active:scale-[0.98]',
                      on
                        ? 'border-navy bg-navy text-paper shadow-card'
                        : 'border-line bg-white text-navy hover:border-gold/70 hover:bg-paper',
                    )}
                  >
                    <Icon className={cn('h-7 w-7', on ? 'text-gold' : 'text-navy/70')} strokeWidth={1.6} />
                    <span className="text-base font-semibold">{label}</span>
                    <span className={cn('text-[11px]', on ? 'text-paper/70' : 'text-muted')}>{sub}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {sede} · {fecha}
              {turno && ` · ${idReporte(fecha, turno, sede)}`}
            </p>
          </div>

          {turno && (
            <div className="grid gap-5 border-t border-line/60 pt-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Users className="h-3.5 w-3.5" strokeWidth={2} /> Colaboradores del turno
                </div>
                <PersonaPicker
                  empleados={empleadosOrden}
                  selected={trabajadores}
                  onChange={setTrabajadores}
                  placeholder="Buscar colaborador…"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <PenLine className="h-3.5 w-3.5" strokeWidth={2} /> Encargado del turno
                  <span className="font-normal normal-case text-muted/80">· quien firma</span>
                </div>
                <PersonaPicker
                  empleados={empleadosOrden}
                  selected={encargadoSel}
                  onChange={setEncargadoSel}
                  placeholder="Buscar encargado…"
                  single
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!turno && (
        <Card>
          <CardContent className="py-10 text-center">
            <Clock className="mx-auto mb-3 h-9 w-9 text-gold/70" strokeWidth={1.5} />
            <p className="text-sm text-muted">Selecciona un turno para cargar las actividades del día.</p>
          </CardContent>
        </Card>
      )}
      {cargando && <p className="text-sm text-muted">Cargando actividades…</p>}

      {turno && !cargando && (
        <>
          {/* ── Limpieza (mapa de zonas) ── */}
          {zonas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Limpieza</CardTitle>
                <span className="text-xs text-muted">Marca en el mapa las zonas que limpiaste</span>
              </CardHeader>
              <CardContent>
                <LayoutMap zonas={zonas} turno={turno} selected={limpieza} onChange={setLimpieza} />
              </CardContent>
            </Card>
          )}

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
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2} /> Todas
                </button>
                <button
                  type="button"
                  onClick={() => marcarTodas(false)}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-gold"
                >
                  <Square className="h-3.5 w-3.5" strokeWidth={2} /> Ninguna
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {cat.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No hay actividades configuradas para este turno.</p>
              )}
              {cat.map((a) => {
                const on = Boolean(done[a.cod]);
                return (
                  <div
                    key={a.cod}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150',
                      on ? 'border-navy/15 bg-navy/[0.03]' : 'border-line bg-white',
                    )}
                  >
                    <span className="w-12 shrink-0 font-mono text-xs text-muted">{a.cod}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-navy">{a.nombre}</span>
                        {a.peso > 0 && <span className="font-mono text-[11px] text-muted">{a.peso}pts</span>}
                        {a.pendienteAcumulado && <Badge tone="amber">pendiente</Badge>}
                      </div>
                    </div>
                    {a.categoria && <Badge tone={catTone(a.categoria)}>{a.categoria}</Badge>}
                    <input
                      value={obs[a.cod] ?? ''}
                      onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                      placeholder="Obs."
                      className={cn(fieldCls, 'w-40 text-xs')}
                    />
                    <Toggle on={on} onClick={() => setDone((p) => ({ ...p, [a.cod]: !p[a.cod] }))} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Incidencias del turno ── */}
          <Card>
            <CardHeader>
              <CardTitle>Incidencias del turno</CardTitle>
              <button
                type="button"
                onClick={() => setIncidencias((p) => [...p, { tipo: '', nivel: 'Medio', descripcion: '', responsableId: '', puntosPenalidad: 2 }])}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
              </button>
            </CardHeader>
            <CardContent>
              {incidencias.length === 0 ? (
                <p className="text-sm text-muted">Sin incidencias registradas.</p>
              ) : (
                <div className="space-y-3">
                  {incidencias.map((inc, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 border-b border-line/60 pb-3 sm:grid-cols-2">
                      <select
                        value={inc.tipo}
                        onChange={(e) => {
                          const t = tiposIncidencia.find((x) => x.tipo === e.target.value);
                          setIncidencias((p) =>
                            p.map((x, j) =>
                              j === i
                                ? { ...x, tipo: e.target.value, nivel: t?.nivelDefault ?? x.nivel, puntosPenalidad: t?.puntosDefault ?? x.puntosPenalidad }
                                : x,
                            ),
                          );
                        }}
                        className={cn(fieldCls, 'w-full')}
                      >
                        <option value="">Tipo de incidencia…</option>
                        {tiposIncidencia.map((t) => (
                          <option key={t.id} value={t.tipo}>
                            {t.tipo}
                          </option>
                        ))}
                      </select>
                      <select
                        value={inc.responsableId}
                        onChange={(e) => setIncidencias((p) => p.map((x, j) => (j === i ? { ...x, responsableId: e.target.value } : x)))}
                        className={cn(fieldCls, 'w-full')}
                      >
                        <option value="">Responsable…</option>
                        {empleados.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        value={inc.descripcion}
                        onChange={(e) => setIncidencias((p) => p.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                        placeholder="Descripción"
                        className={cn(fieldCls, 'w-full sm:col-span-2')}
                      />
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <select
                          value={inc.nivel}
                          onChange={(e) => setIncidencias((p) => p.map((x, j) => (j === i ? { ...x, nivel: e.target.value } : x)))}
                          className={cn(fieldCls, 'w-28')}
                          aria-label="Nivel"
                        >
                          {NIVELES_INC.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.5"
                          value={inc.puntosPenalidad}
                          onChange={(e) => setIncidencias((p) => p.map((x, j) => (j === i ? { ...x, puntosPenalidad: Number(e.target.value) } : x)))}
                          className={cn(fieldCls, 'w-20')}
                          aria-label="Puntos"
                        />
                        <button
                          type="button"
                          onClick={() => setIncidencias((p) => p.filter((_, j) => j !== i))}
                          className="ml-auto text-muted transition-colors hover:text-red-600"
                          aria-label="Quitar"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Actividades Extras ── */}
          <Card>
            <CardHeader>
              <CardTitle>Extras</CardTitle>
              <button
                type="button"
                onClick={() => setExtras((p) => [...p, { tipo: '', nombre: '', cantidad: 1, monto: 0 }])}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
              </button>
            </CardHeader>
            <CardContent>
              {extras.length === 0 ? (
                <p className="text-sm text-muted">Sin extras registrados.</p>
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
                        className="text-muted transition-colors hover:text-red-600"
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
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-emerald-600/20 bg-emerald-50/60 p-4 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Limpieza</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-emerald-700">{limpiezaPts.got}</div>
                  <div className="text-[10px] text-muted">de {limpiezaPts.tot} pts</div>
                </div>
                <div className="rounded-xl border border-navy/15 bg-navy/5 p-4 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Actividades</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-navy">
                    {actDone}/{cat.length}
                  </div>
                  <div className="text-[10px] text-muted">completadas</div>
                </div>
                <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Equipo</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-[#7a6e0e]">{trabajadores.length}</div>
                  <div className="text-[10px] text-muted">colaboradores</div>
                </div>
                <div className="rounded-xl border border-navy/15 bg-navy/5 p-4 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Total puntos</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-navy">{totalPts}</div>
                  <div className="text-[10px] text-muted">+{extras.filter((e) => e.nombre.trim()).length} extras</div>
                </div>
              </div>

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!puedeEnviar}
                  className={cn(buttonVariants({ variant: 'primary' }), 'flex-1 justify-center py-3 text-base', !puedeEnviar && 'opacity-50')}
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                  {pending ? 'Enviando…' : 'Enviar reporte'}
                </button>
                <span className="text-xs text-muted">
                  {encargadoSel.length === 1
                    ? 'Se guarda automáticamente mientras lo completas.'
                    : 'Selecciona al encargado del turno para poder enviar.'}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
