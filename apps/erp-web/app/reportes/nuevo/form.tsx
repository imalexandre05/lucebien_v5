'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Clock, Check, Square, Plus, Minus, Trash2, Send, Users, PenLine, ClipboardCheck, ArrowRight, Wallet, Star, HelpCircle } from 'lucide-react';
import { idReporte, TURNO_LABEL, minutosHastaCierre, formatoCierre, type TurnoReporte } from '@scilb/core';
import { iniciarTurno, accionCrearReporte, accionGuardarDraft } from '../actions';
import type { ActividadDelTurno, ExtraCatalogo, LayoutZona, YaEnviado, ReportePendiente } from '../../../lib/reportes-repo';
import type { TipoIncidencia } from '../../../lib/incidencias-repo';
import { LayoutMap } from '../layout-map';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge, type Tone } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { PersonaPicker } from '../../../components/ui/persona-picker';
import { cn } from '../../../lib/cn';

type Emp = { id: string; nombre: string; rol: string; sedeCod: string | null };
// Extras (Fase 5 tarea 3): cod enlaza con el catálogo (actividades_config, categoria='EXT');
// null = extra "libre" (escape hatch de texto, sin catálogo). Nada de monto/peso aquí — son
// insumo de pago/desempeño que el RPC deriva server-side del catálogo (ver reportes-repo.ts);
// el operativo solo decide QUÉ se hizo y CUÁNTAS veces, nunca ve puntos ni tipea un monto.
type Extra = { cod: string | null; nombre: string; tipoAct: 'remunerada' | 'por_puntos' | 'libre'; cantidad: number; registradoPorId: string };
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

// Normaliza un extra del draft (jsonb, tipo desconocido) a la forma actual — cubre drafts en
// vuelo guardados ANTES de la Fase 5 (forma vieja: tipo/nombre/cantidad/monto/registradoPorId,
// sin cod/tipoAct). Un draft viejo simplemente cae a "libre" con su nombre tal cual.
function normalizarExtraDraft(raw: unknown): Extra | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const nombre = typeof r.nombre === 'string' ? r.nombre : '';
  const cod = typeof r.cod === 'string' && r.cod ? r.cod : null;
  const tipoAct: Extra['tipoAct'] = r.tipoAct === 'remunerada' || r.tipoAct === 'por_puntos' ? r.tipoAct : 'libre';
  if (!cod && !nombre) return null;
  return {
    cod,
    nombre,
    tipoAct: cod ? tipoAct : 'libre',
    cantidad: Number(r.cantidad) > 0 ? Number(r.cantidad) : 1,
    registradoPorId: typeof r.registradoPorId === 'string' ? r.registradoPorId : '',
  };
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
  cierres,
}: {
  sede: string;
  fecha: string;
  encargadoId: string | null;
  empleados: Emp[];
  tiposIncidencia: TipoIncidencia[];
  cierres: Record<TurnoReporte, string>;
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
  const [catalogoExtras, setCatalogoExtras] = useState<ExtraCatalogo[]>([]);
  const [zonas, setZonas] = useState<LayoutZona[]>([]);
  const [limpieza, setLimpieza] = useState<string[]>([]);
  const [incidencias, setIncidencias] = useState<IncRep[]>([]);
  const [yaEnviado, setYaEnviado] = useState<YaEnviado>(null);
  const [conflicto, setConflicto] = useState<{ turno: TurnoReporte; id: string } | null>(null);
  // Tarea 2: reporte anterior de la sede aún pendiente de evaluación — bloquea igual que
  // `conflicto` (mismo patrón visual), pero el RPC reportes_crear es quien lo hace cumplir de
  // verdad; esto es solo para avisar ANTES de llenar todo el formulario.
  const [pendienteAnterior, setPendienteAnterior] = useState<ReportePendiente>(null);
  const [error, setError] = useState('');
  const [bloqueoId, setBloqueoId] = useState<string | null>(null);
  const [minutosRestantes, setMinutosRestantes] = useState<number | null>(null);
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
    setBloqueoId(null);
    setYaEnviado(null);
    setConflicto(null);
    setPendienteAnterior(null);
    iniciarTurno(sede, fecha, turno)
      .then(({ actividades, zonas, extrasCatalogo, draft, yaEnviado, conflicto, pendienteAnterior }) => {
        if (!vivo) return;
        setYaEnviado(yaEnviado);
        setConflicto(conflicto);
        setPendienteAnterior(conflicto ? null : pendienteAnterior);
        setCat(actividades);
        setZonas(zonas);
        setCatalogoExtras(extrasCatalogo);
        const d = (draft ?? {}) as {
          trabajadores?: string[];
          encargado?: string[];
          actividades?: { cod: string; realizada?: boolean; obs?: string }[];
          extras?: unknown[];
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
        setExtras((d.extras ?? []).map(normalizarExtraDraft).filter((x): x is Extra => x !== null));
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
  const puedeEnviar = Boolean(turno) && !conflicto && !pendienteAnterior && encargadoSel.length === 1 && !pending;

  // Tarea 6: el encargado SIEMPRE cuenta como colaborador (el RPC lo agrega a
  // reporte_trabajadores aunque no esté en el picker de "Colaboradores del turno") — el contador
  // de Equipo refleja esa unión, no solo el picker de trabajadores.
  const equipoCount = useMemo(
    () => new Set([...trabajadores, ...encargadoSel]).size,
    [trabajadores, encargadoSel],
  );

  // Tarea 5: cuenta regresiva hasta el cierre del turno elegido. Solo informativa — el cierre
  // real lo hace el cron server-side (reportes_auto_cierre); esto avisa antes de que llegue.
  useEffect(() => {
    if (!turno || yaEnviado || conflicto || pendienteAnterior) {
      setMinutosRestantes(null);
      return;
    }
    const tick = () => setMinutosRestantes(minutosHastaCierre(new Date(), cierres[turno]));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [turno, yaEnviado, conflicto, pendienteAnterior, cierres]);

  // Autosave (debounce 1.2s).
  const primeraVez = useRef(true);
  useEffect(() => {
    if (!turno || cargando || yaEnviado) return;
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
  }, [turno, cargando, yaEnviado, sede, fecha, encargadoId, trabajadores, encargadoSel, done, obs, extras, cat, limpieza]);

  function marcarTodas(valor: boolean) {
    setDone(Object.fromEntries(cat.map((a) => [a.cod, valor])));
  }

  // Extras (Fase 5 tarea 3): clic en el catálogo agrega +1 (o crea la fila si es la primera vez).
  // Nunca pide un monto — el precio/peso los deriva el servidor del catálogo al enviar.
  function agregarCatalogo(c: ExtraCatalogo) {
    setExtras((p) => {
      const i = p.findIndex((e) => e.cod === c.cod);
      if (i >= 0) return p.map((e, j) => (j === i ? { ...e, cantidad: e.cantidad + 1 } : e));
      return [...p, { cod: c.cod, nombre: c.nombre, tipoAct: c.tipoAct as Extra['tipoAct'], cantidad: 1, registradoPorId: '' }];
    });
  }
  function cambiarCantidadExtra(i: number, delta: number) {
    setExtras((p) => p.map((e, j) => (j === i ? { ...e, cantidad: Math.max(1, e.cantidad + delta) } : e)));
  }
  function quitarExtra(i: number) {
    setExtras((p) => p.filter((_, j) => j !== i));
  }
  function agregarExtraLibre() {
    setExtras((p) => [...p, { cod: null, nombre: '', tipoAct: 'libre', cantidad: 1, registradoPorId: '' }]);
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
    setBloqueoId(null);
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
          .filter((e) => e.cod || e.nombre.trim())
          .map((e) => ({
            cod: e.cod,
            tipo: e.tipoAct,
            nombre: e.nombre,
            cantidad: e.cantidad || 1,
            detalle: '',
            registrado_por_id: e.registradoPorId || null,
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
        setBloqueoId(r.bloqueoId ?? null);
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
                    data-testid={`turno-${v}`}
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

          {turno && !yaEnviado && !conflicto && (
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
                  testId="picker-trabajadores"
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
                  testId="picker-encargado"
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

      {turno && !cargando && yaEnviado && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            {yaEnviado.estadoEnvio === 'sin_actividad' ? (
              <>
                <Clock className="h-10 w-10 text-muted" strokeWidth={1.5} />
                <div>
                  <p className="text-lg font-semibold text-navy">Este turno venció sin actividad registrada</p>
                  <p className="mt-1 text-sm text-muted">
                    Se cerró automáticamente al pasar el plazo porque no había ningún borrador guardado. No hay nada que evaluar.
                  </p>
                </div>
              </>
            ) : (
              <>
                <ClipboardCheck className="h-10 w-10 text-emerald-600" strokeWidth={1.5} />
                <div>
                  <p className="text-lg font-semibold text-navy">
                    {yaEnviado.estadoEnvio === 'no_enviado' ? 'Este turno se cerró automáticamente' : 'Este turno ya se envió'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {yaEnviado.estadoEnvio === 'no_enviado' ? (
                      'Venció el plazo, pero se guardó todo lo que ya habías marcado (actividades, limpieza, extras, colaboradores). Corresponde evaluarlo.'
                    ) : (
                      <>
                        El reporte <span className="font-mono">{yaEnviado.id}</span> ya está registrado. Ahora corresponde evaluarlo.
                      </>
                    )}
                  </p>
                </div>
                <Link href={`/reportes/${yaEnviado.id}`} className={cn(buttonVariants({ variant: 'primary' }), 'px-5')}>
                  Evaluar reporte <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {turno && !cargando && !yaEnviado && conflicto && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Clock className="h-10 w-10 text-amber-500" strokeWidth={1.5} />
            <div>
              <p className="text-lg font-semibold text-navy">Este horario ya está cubierto</p>
              <p className="mt-1 text-sm text-muted">
                Ya existe un reporte de <span className="font-semibold">{TURNO_LABEL[conflicto.turno] ?? conflicto.turno}</span> para {sede} · {fecha}, que ya cubre este horario. No se puede crear otro reporte encima.
              </p>
            </div>
            <Link href={`/reportes/${conflicto.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'px-5')}>
              Ver ese reporte <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Tarea 2: reporte anterior de la sede aún pendiente de evaluación — mismo patrón que el
          conflicto de turno de arriba (bloqueo total con enlace), pero por un motivo distinto:
          no es que este horario esté cubierto, es que el ciclo evaluación→siguiente reporte no se
          cerró. El RPC reportes_crear rechaza esto igual aunque se saltee esta pantalla. */}
      {turno && !cargando && !yaEnviado && !conflicto && pendienteAnterior && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ClipboardCheck className="h-10 w-10 text-amber-500" strokeWidth={1.5} />
            <div>
              <p className="text-lg font-semibold text-navy">Hay un reporte anterior pendiente de evaluación</p>
              <p className="mt-1 text-sm text-muted">
                El reporte de <span className="font-semibold">{TURNO_LABEL[pendienteAnterior.turno] ?? pendienteAnterior.turno}</span> del {pendienteAnterior.fecha} en {sede} todavía no se evaluó. Evalúalo antes de crear uno nuevo.
              </p>
            </div>
            <Link href={`/reportes/${pendienteAnterior.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'px-5')}>
              Ver ese reporte <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </CardContent>
        </Card>
      )}

      {turno && !cargando && !yaEnviado && !conflicto && !pendienteAnterior && (
        <>
          {/* ── Limpieza + Actividades lado a lado en xl (una pantalla, no un pergamino) ── */}
          <div className={cn('grid grid-cols-1 gap-4', zonas.length > 0 && 'xl:grid-cols-5')}>
            {zonas.length > 0 && (
              // Fase 5 tarea 1: flex-col + CardContent flex-1 propaga la altura que el grid ya le
              // da a esta Card (stretch por defecto, igualada a la de "Actividades del turno") hasta
              // el lienzo — antes el lienzo solo medía lo que su aspectRatio 800×580 daba y el resto
              // de la columna quedaba vacío/cortado a media sección.
              <Card className="flex flex-col xl:col-span-3">
                <CardHeader>
                  <CardTitle>Limpieza</CardTitle>
                  <span className="text-xs text-muted">Marca en el mapa las zonas que limpiaste</span>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <LayoutMap zonas={zonas} turno={turno} selected={limpieza} onChange={setLimpieza} />
                </CardContent>
              </Card>
            )}

            {/* ── Actividades del Turno (lista compacta con scroll propio) ── */}
            <Card className={cn(zonas.length > 0 && 'xl:col-span-2')}>
              <CardHeader>
                <CardTitle>Actividades del turno</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {actDone}/{cat.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => marcarTodas(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold active:scale-[0.97]"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} /> Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => marcarTodas(false)}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-gold active:scale-[0.97]"
                  >
                    <Square className="h-3.5 w-3.5" strokeWidth={2} /> Ninguna
                  </button>
                </div>
              </CardHeader>
              <CardContent className={cn('space-y-1.5', zonas.length > 0 && 'max-h-[640px] overflow-y-auto')}>
                {cat.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">No hay actividades configuradas para este turno.</p>
                )}
                {cat.map((a) => {
                  const on = Boolean(done[a.cod]);
                  return (
                    <div
                      key={a.cod}
                      className={cn(
                        'flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-2.5 py-1.5 transition-colors duration-150',
                        on ? 'border-navy/15 bg-navy/[0.03]' : 'border-line bg-white',
                      )}
                    >
                      <span className="w-10 shrink-0 font-mono text-[11px] text-muted">{a.cod}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium leading-snug text-navy">{a.nombre}</span>
                        {a.peso > 0 && <span className="ml-1.5 font-mono text-[10px] text-muted">{a.peso}pts</span>}
                        {a.pendienteAcumulado && (
                          <Badge tone="amber" className="ml-1.5">
                            pendiente
                          </Badge>
                        )}
                      </div>
                      {a.categoria && <Badge tone={catTone(a.categoria)}>{a.categoria}</Badge>}
                      <input
                        value={obs[a.cod] ?? ''}
                        onChange={(e) => setObs((p) => ({ ...p, [a.cod]: e.target.value }))}
                        placeholder="Obs."
                        aria-label={`Observación de ${a.nombre}`}
                        className={cn(fieldCls, 'w-24 px-2 py-1 text-xs')}
                      />
                      <Toggle on={on} onClick={() => setDone((p) => ({ ...p, [a.cod]: !p[a.cod] }))} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* ── Incidencias + Extras lado a lado en xl ── */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Incidencias del turno</CardTitle>
              <button
                type="button"
                onClick={() => setIncidencias((p) => [...p, { tipo: '', nivel: 'Medio', descripcion: '', responsableId: '', puntosPenalidad: 2 }])}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold active:scale-[0.97]"
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
                        <option value="">— sin responsable (el admin investigará) —</option>
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
                        <div className="flex gap-1.5">
                          {NIVELES_INC.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setIncidencias((p) => p.map((x, j) => (j === i ? { ...x, nivel: n } : x)))}
                              className={cn(
                                'rounded-md border-2 px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
                                inc.nivel === n
                                  ? n === 'Alto'
                                    ? 'border-red-500 bg-red-50 text-red-700'
                                    : n === 'Medio'
                                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                                      : 'border-slate-400 bg-slate-100 text-slate-700'
                                  : 'border-line bg-white text-muted hover:border-gold/60',
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
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

          {/* ── Actividades Extras: catálogo en botones (Fase 5 tarea 3) ──
              Sin monto ni puntaje visibles — el operativo solo elige qué + cuántas veces + quién.
              El precio/peso los deriva el servidor del catálogo al enviar (reportes-repo.ts). */}
          <Card>
            <CardHeader>
              <CardTitle>Extras</CardTitle>
              {extras.length > 0 && (
                <span className="font-mono text-xs text-muted tabular-nums">{extras.length} agregado(s)</span>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {catalogoExtras.length === 0 ? (
                <p className="text-xs text-muted">
                  Catálogo de extras no configurado para esta sede — usa &quot;Otra actividad&quot; para registrar uno igual.
                </p>
              ) : (
                (['remunerada', 'por_puntos'] as const).map((tipoAct) => {
                  const grupo = catalogoExtras.filter((c) => c.tipoAct === tipoAct);
                  if (!grupo.length) return null;
                  const Icon = tipoAct === 'remunerada' ? Wallet : Star;
                  return (
                    <div key={tipoAct}>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        {tipoAct === 'remunerada' ? 'Remuneradas' : 'Por puntos'}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {grupo.map((c) => {
                          const enLista = extras.find((e) => e.cod === c.cod);
                          return (
                            <button
                              key={c.cod}
                              type="button"
                              onClick={() => agregarCatalogo(c)}
                              title={tipoAct === 'remunerada' && c.precioUnitario > 0 ? `S/ ${c.precioUnitario.toFixed(2)} / ${c.unidad}` : c.nombre}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 active:scale-[0.97]',
                                enLista
                                  ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700'
                                  : 'border-line bg-white text-navy hover:border-gold/70',
                              )}
                            >
                              {enLista ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Plus className="h-3 w-3" strokeWidth={2.5} />}
                              {c.nombre}
                              {enLista && <span className="font-mono text-[11px] font-bold">×{enLista.cantidad}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {extras.length > 0 && (
                <div className="space-y-2 border-t border-line/60 pt-3">
                  {extras.map((e, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line/60 p-2">
                      {e.cod ? (
                        <span className="min-w-[9rem] flex-1 text-sm text-navy">{e.nombre}</span>
                      ) : (
                        <input
                          value={e.nombre}
                          onChange={(ev) => setExtras((p) => p.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))}
                          placeholder="Descripción de la actividad"
                          className={cn(fieldCls, 'min-w-[9rem] flex-1')}
                        />
                      )}
                      <div className="inline-flex items-center gap-0.5 rounded-md border border-line">
                        <button
                          type="button"
                          onClick={() => cambiarCantidadExtra(i, -1)}
                          aria-label={`Menos ${e.nombre || 'cantidad'}`}
                          className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">{e.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadExtra(i, 1)}
                          aria-label={`Más ${e.nombre || 'cantidad'}`}
                          className="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-paper active:scale-[0.97]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                      <select
                        value={e.registradoPorId}
                        onChange={(ev) => setExtras((p) => p.map((x, j) => (j === i ? { ...x, registradoPorId: ev.target.value } : x)))}
                        aria-label="Quién lo hizo"
                        className={cn(fieldCls, 'w-full sm:w-auto sm:flex-1')}
                      >
                        <option value="">¿Quién lo hizo?…</option>
                        {empleadosOrden.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nombre}
                          </option>
                        ))}
                      </select>
                      {!e.cod && (
                        <span title="Sin catálogo: el admin la revisa a mano">
                          <Badge tone="amber">A revisar</Badge>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => quitarExtra(i)}
                        className="text-muted transition-colors hover:text-red-600"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={agregarExtraLibre}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-gold hover:text-navy active:scale-[0.97]"
              >
                <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} /> Otra actividad (sin catálogo)
              </button>
            </CardContent>
          </Card>
          </div>

          {/* ── Resumen + Envío: barra fija abajo, siempre a la vista ── */}
          <div className="sticky bottom-0 z-20 rounded-t-xl border border-line bg-white/95 px-4 py-3 shadow-lift backdrop-blur">
            {error && (
              <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{error}</span>
                {bloqueoId && (
                  <Link
                    href={`/reportes/${bloqueoId}`}
                    className="font-medium underline underline-offset-2 hover:text-red-800"
                  >
                    Ver ese reporte
                  </Link>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="text-xs text-muted">
                Limpieza{' '}
                <span className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                  {limpiezaPts.got}
                </span>
                <span className="font-mono text-[11px] text-muted">/{limpiezaPts.tot}</span>
              </span>
              <span className="text-xs text-muted">
                Actividades{' '}
                <span className="font-mono text-sm font-bold tabular-nums text-navy">
                  {actDone}/{cat.length}
                </span>
              </span>
              <span className="text-xs text-muted" title="El encargado del turno siempre cuenta como colaborador">
                Equipo <span className="font-mono text-sm font-bold tabular-nums text-navy">{equipoCount}</span>
              </span>
              {extras.filter((e) => e.nombre.trim()).length > 0 && (
                <span className="text-xs text-muted">
                  Extras{' '}
                  <span className="font-mono text-sm font-bold tabular-nums text-navy">
                    {extras.filter((e) => e.nombre.trim()).length}
                  </span>
                </span>
              )}
              <span className="rounded-full bg-gold/15 px-3 py-1 text-xs text-muted">
                Total{' '}
                <span className="font-mono text-base font-bold tabular-nums text-[#7a6e0e]">{totalPts}</span>{' '}
                pts
              </span>
              {/* Tarea 5: cuenta regresiva del turno — ámbar a ≤30 min, como avisaba el header.js
                  del sistema viejo. */}
              {minutosRestantes !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-medium tabular-nums',
                    minutosRestantes <= 0
                      ? 'bg-red-50 text-red-700'
                      : minutosRestantes <= 30
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-navy/5 text-muted',
                  )}
                >
                  <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                  {formatoCierre(minutosRestantes)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-xs text-muted sm:inline">
                  {encargadoSel.length === 1
                    ? 'Se guarda automáticamente mientras lo completas.'
                    : 'Selecciona al encargado del turno para poder enviar.'}
                </span>
                <Button
                  type="button"
                  data-testid="enviar-reporte"
                  onClick={submit}
                  disabled={!puedeEnviar}
                  pending={pending}
                  className="px-6 py-2.5"
                >
                  {!pending && <Send className="h-4 w-4" strokeWidth={2} />}
                  {pending ? 'Enviando…' : 'Enviar reporte'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
