'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Filter, ChevronRight, Award, AlertTriangle } from 'lucide-react';
import {
  COMPONENTES,
  calcularNotaMensual,
  calcularCiclo,
  notaCompetencias,
  revisarPesos,
  tramoEval,
  TRAMO_LABEL,
  type ComponentesEval,
  type PesosEval,
  type TramoEval,
  type Ciclo,
} from '@scilb/core';
import { accionCrearEvaluacion, accionComponentesEval } from './actions';
import type { Evaluacion, EmpleadoParaEvaluacion, CompetenciaConfig } from '../../lib/evaluaciones-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { campoCls } from '../../components/ui/form';
import { cn } from '../../lib/cn';
import { hoyPeru } from '../../lib/fechas';

// Perfil por componente (§4C): barras sobrias /20 con el peso usado al lado.
// Los valores van siempre en texto (la barra es refuerzo, nunca el único canal).
// Los snapshots antiguos guardaron pesos en % (25) y los nuevos en fracción (0.25):
// se normaliza solo la presentación.
const fmtPeso = (p: number | undefined | null) =>
  p == null ? '—' : p > 1 ? `${p}%` : `${Math.round(p * 100)}%`;

// Aviso de C-2 (spec nota-sin-ceros-silenciosos): comas de miles/decimales al estilo peruano,
// mismo criterio que el resto de la pantalla (S/ en app/estadisticas, app/compras, etc.).
const fmtSuma = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

function PerfilComponentes({
  componentes,
  pesos,
}: {
  componentes: Record<string, number>;
  pesos: Record<string, number>;
}) {
  const descuento = Number(componentes.descuentoIncidencias ?? 0);
  const bonus = Number(componentes.bonusVentas ?? 0);
  return (
    <div className="animate-fade">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {COMPONENTES.map(({ key, label }) => {
          const v = Number(componentes[key] ?? 0);
          const pct = Math.max(0, Math.min(100, (v / 20) * 100));
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink">
                  {label}
                  <span className="ml-1.5 tabular-nums text-[10px] text-muted">{fmtPeso(pesos[key])}</span>
                </span>
                <span className="tabular-nums text-xs font-semibold text-navy">{v.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/60">
                <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {(descuento !== 0 || bonus !== 0) && (
        <p className="mt-3 border-t border-line/60 pt-2 text-[11px] text-muted">
          Ajustes: −{descuento.toFixed(1)} por incidencias · +{bonus.toFixed(1)} bonus por ventas
        </p>
      )}
    </div>
  );
}

const TRAMO_TONE: Record<TramoEval, Tone> = {
  excelente: 'green',
  bueno: 'navy',
  mejorar: 'amber',
  bajo: 'gray',
};
const TRAMOS: TramoEval[] = ['excelente', 'bueno', 'mejorar', 'bajo'];
const fieldCls = campoCls;

const CERO: ComponentesEval = {
  competencias: 0,
  valores: 0,
  operaciones: 0,
  software: 0,
  limpieza: 0,
  examenes: 0,
  tardanza: 20,
  descuentoIncidencias: 0,
  bonusVentas: 0,
};

// Evaluación recién guardada: el contexto mínimo para la nota de referencia que aparece debajo
// (R4, spec §2.6: "la liquidación ES el pago" — acá ya no se registra nada, sólo se informa).
type EvalGuardada = {
  id: string;
  empleadoId: string;
  nombre: string;
  notaFinal: number;
  cicloDesde: string;
  cicloHasta: string;
};

export function EvaluacionesCliente({
  evaluaciones,
  empleados,
  pesos,
  esAdmin,
  competenciasConfig,
}: {
  evaluaciones: Evaluacion[];
  empleados: EmpleadoParaEvaluacion[];
  pesos: PesosEval;
  esAdmin: boolean;
  competenciasConfig: CompetenciaConfig[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState('');
  // Ciclo por aniversario (Fase 12 tarea 3): se auto-calcula al elegir empleado
  // (calcularCiclo, packages/core/src/evaluaciones.ts, puerto de routes/evaluaciones.js:98-127).
  // Los inputs quedan editables por si el admin necesita corregirlo a mano.
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [cicloEditado, setCicloEditado] = useState(false);
  const [comp, setComp] = useState<ComponentesEval>(CERO);
  // Competencias (Fase 12 tarea 2): nivel 0-4 elegido por competencia, cod → nivel. La nota se
  // deriva con notaCompetencias() y se mezcla en compParaCalculo, no se edita como número suelto.
  const [competenciaSel, setCompetenciaSel] = useState<Record<string, number>>({});
  // Contexto informativo (no entra a la fórmula: no hay regla de negocio confirmada para
  // convertir puntos de pipeline o soles de extras a la escala /20). El admin lo ve al lado
  // de los componentes editables y lo pondera con su propio criterio.
  const [infoExtra, setInfoExtra] = useState<{ puntosPipeline: number; extrasMonto: number; extrasCantidad: number; extrasPuntos: number } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Nota de referencia (R4, spec §2.6): aparece justo después de guardar la evaluación, en la
  // MISMA pantalla. Antes acá vivía el panel que registraba el pago contra el sistema viejo — ese
  // camino se cerró (ROTURA 2, validador de flujo 23-ago-2026): la liquidación es el pago, y esta
  // pantalla ya no escribe nada, sólo apunta a dónde se registra.
  const [evalGuardada, setEvalGuardada] = useState<EvalGuardada | null>(null);

  // Filtros del historial.
  const [q, setQ] = useState('');
  const [fMes, setFMes] = useState('');
  const [fTramo, setFTramo] = useState('');
  const [expandida, setExpandida] = useState<string | null>(null);

  const competenciaNota = useMemo(() => {
    if (!competenciasConfig.length) return 0;
    return notaCompetencias(competenciasConfig.map((c) => competenciaSel[c.cod] ?? 0));
  }, [competenciaSel, competenciasConfig]);

  // Competencias sin responder. El nivel 0 es el PEOR escalón de la rúbrica, así que arrancar con
  // una opción preseleccionada hacía indistinguible «lo evalué en 0» de «no lo miré», y bastaba
  // abrir y guardar para mandar ocho ceros a una nota que termina en el sueldo de alguien. Se
  // arranca vacío y no se puede guardar hasta responder las ocho (mismo criterio que /valores).
  const competenciasFaltantes = useMemo(
    () => competenciasConfig.filter((c) => competenciaSel[c.cod] === undefined).length,
    [competenciaSel, competenciasConfig],
  );

  const compParaCalculo = useMemo(() => ({ ...comp, competencias: competenciaNota }), [comp, competenciaNota]);
  const nota = useMemo(() => calcularNotaMensual(compParaCalculo, pesos), [compParaCalculo, pesos]);
  const tramo = tramoEval(nota);
  // C-2 (spec nota-sin-ceros-silenciosos): revisarPesos() no corrige nada — sólo hace visible
  // cuánto se alejan de 1 los pesos configurados, para que el administrador decida con el número
  // delante. La decisión de forzar que sumen 1 sigue abierta (decisión 14, pendientes-negocio.md).
  const revisionPesos = useMemo(() => revisarPesos(pesos), [pesos]);

  const meses = useMemo(() => [...new Set(evaluaciones.map((e) => e.mes))].sort().reverse(), [evaluaciones]);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return evaluaciones.filter((e) => {
      if (fMes && e.mes !== fMes) return false;
      if (fTramo && tramoEval(e.notaFinal) !== fTramo) return false;
      if (needle && !(e.empleadoNombre ?? '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [evaluaciones, q, fMes, fTramo]);

  const resumen = useMemo(() => {
    const total = filtradas.length;
    const prom = total ? filtradas.reduce((s, e) => s + e.notaFinal, 0) / total : 0;
    return {
      total,
      promedio: prom.toFixed(2),
      excelente: filtradas.filter((e) => tramoEval(e.notaFinal) === 'excelente').length,
      bajo: filtradas.filter((e) => tramoEval(e.notaFinal) === 'bajo').length,
    };
  }, [filtradas]);

  const set = (k: keyof ComponentesEval, v: number) => setComp((p) => ({ ...p, [k]: v }));

  function elegirEmpleado(id: string) {
    setEmpleadoId(id);
    setEvalGuardada(null);
    setInfoExtra(null);
    setComp(CERO);
    setCompetenciaSel({});
    setCicloEditado(false);
    const emp = empleados.find((e) => e.id === id);
    setCiclo(emp ? calcularCiclo(emp.fechaIngreso, hoyPeru()) : null);
  }

  function setCicloDesde(v: string) {
    setCiclo((c) => (c ? { ...c, desde: v } : c));
    setCicloEditado(true);
  }
  function setCicloHasta(v: string) {
    setCiclo((c) => (c ? { ...c, hasta: v } : c));
    setCicloEditado(true);
  }

  function calcularDesdeData() {
    if (!ciclo) return;
    setError('');
    startTransition(async () => {
      const r = await accionComponentesEval(empleadoId, ciclo.desde, ciclo.hasta);
      if (!r.ok || !r.comp) {
        setError(r.error ?? 'Error al calcular');
        return;
      }
      const c = r.comp;
      setComp((p) => ({
        ...p,
        operaciones: c.operaciones ?? 0,
        software: c.software ?? 0,
        limpieza: c.limpieza ?? 0,
        tardanza: c.tardanza ?? p.tardanza,
        descuentoIncidencias: c.descuento ?? 0,
        // valores (Fase 12, RPC 0057): nota real de Valores 360° del mes del ciclo. Sigue igual
        // (típicamente 0) si nadie evaluó a esta persona todavía este mes.
        valores: c.valores ?? p.valores,
        bonusVentas: c.bonusVentas ?? p.bonusVentas,
      }));
      // Solo aparece si la migración 0044+ ya está aplicada (campos nuevos en el RPC).
      if (c.puntosPipeline != null || c.extrasMonto != null) {
        setInfoExtra({
          puntosPipeline: c.puntosPipeline ?? 0,
          extrasMonto: c.extrasMonto ?? 0,
          extrasCantidad: c.extrasCantidad ?? 0,
          extrasPuntos: c.extrasPuntos ?? 0,
        });
      }
    });
  }

  function guardar() {
    if (!ciclo) return;
    setError('');
    startTransition(async () => {
      const r = await accionCrearEvaluacion({
        empleadoId,
        mes: ciclo.desde.slice(0, 7),
        notaFinal: nota,
        componentes: compParaCalculo as unknown as Record<string, number>,
        pesos,
        cicloDesde: ciclo.desde,
        cicloHasta: ciclo.hasta,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      const emp = empleados.find((e) => e.id === empleadoId);
      setEvalGuardada({
        id: r.id,
        empleadoId,
        nombre: emp?.nombre ?? '',
        notaFinal: nota,
        cicloDesde: ciclo.desde,
        cicloHasta: ciclo.hasta,
      });
      router.refresh();
    });
  }

  function reiniciar() {
    setAbierto(false);
    setEmpleadoId('');
    setCiclo(null);
    setComp(CERO);
    setCompetenciaSel({});
    setEvalGuardada(null);
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Evaluaciones" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="Promedio" valor={resumen.promedio} tone="gold" />
        <StatBox index={2} label="Excelente" valor={resumen.excelente} tone="exito" />
        <StatBox index={3} label="Bajo" valor={resumen.bajo} tone="neutro" />
      </div>

      {/* Filtros + acción */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empleado…"
            className={`${fieldCls} min-w-[12rem] flex-1`}
          />
          <select value={fMes} onChange={(e) => setFMes(e.target.value)} className={fieldCls} aria-label="Mes">
            <option value="">Todos los meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={fTramo} onChange={(e) => setFTramo(e.target.value)} className={fieldCls} aria-label="Tramo">
            <option value="">Todos los tramos</option>
            {TRAMOS.map((t) => (
              <option key={t} value={t}>
                {TRAMO_LABEL[t]}
              </option>
            ))}
          </select>
          {esAdmin && (
            <button
              type="button"
              onClick={() => (abierto ? reiniciar() : setAbierto(true))}
              className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {abierto ? 'Cerrar' : 'Nueva evaluación'}
            </button>
          )}
        </CardContent>
      </Card>

      {esAdmin && abierto && !evalGuardada && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva evaluación</CardTitle>
            <Badge tone={TRAMO_TONE[tramo]}>
              {nota.toFixed(2)} · {TRAMO_LABEL[tramo]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {revisionPesos.desviado && (
              <div className="flex items-start gap-3 rounded-lg border border-aviso-line bg-aviso-soft px-3 py-2.5 text-sm text-aviso-deep">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span>
                  Los pesos configurados suman <strong>{fmtSuma(revisionPesos.suma)}</strong>: esta nota no
                  está sobre 20 sino sobre {fmtSuma(revisionPesos.suma * 20)}.
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Empleado</label>
                <select value={empleadoId} onChange={(e) => elegirEmpleado(e.target.value)} className={cn(fieldCls, 'w-full')} aria-label="Empleado">
                  <option value="">Elige…</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  Ciclo
                  {ciclo && (
                    <span className="ml-1.5 font-normal normal-case text-muted">
                      ({ciclo.fuente === 'aniversario' ? 'por aniversario' : 'mes calendario — sin fecha de ingreso'}
                      {cicloEditado ? ', editado' : ''})
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input type="date" value={ciclo?.desde ?? ''} disabled={!ciclo} onChange={(e) => setCicloDesde(e.target.value)} className={cn(fieldCls, 'w-full')} />
                  <span className="text-xs text-muted">a</span>
                  <input type="date" value={ciclo?.hasta ?? ''} disabled={!ciclo} onChange={(e) => setCicloHasta(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-line/60 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={calcularDesdeData}
                disabled={!empleadoId || !ciclo}
                pending={pending}
                className="text-xs"
              >
                Calcular desde la data
              </Button>
              <span className="text-xs text-muted">
                Llena operaciones/software/limpieza/valores (del ciclo elegido), tardanza y descuento.
              </span>
            </div>

            {infoExtra && (
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line/60 bg-paper/60 px-3 py-2 text-xs text-muted">
                <span>
                  Puntos de pipeline en el ciclo <span className="tabular-nums font-semibold text-navy">{infoExtra.puntosPipeline}</span>
                </span>
                <span>
                  Extras registrados <span className="tabular-nums font-semibold text-navy">{infoExtra.extrasCantidad}</span>
                  {' · '}
                  <span className="tabular-nums font-semibold text-navy">S/ {infoExtra.extrasMonto.toFixed(2)}</span>
                  {' · '}
                  <span className="tabular-nums font-semibold text-navy">{infoExtra.extrasPuntos} pts</span>
                </span>
                <span className="italic">No entran a la fórmula — contexto para tu criterio.</span>
              </div>
            )}

            <div className="text-xs uppercase tracking-wide text-muted">Componentes (escala /20)</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COMPONENTES.filter(({ key }) => key !== 'competencias').map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="flex-1 text-sm text-navy">
                    {label}
                    <span className="ml-1 tabular-nums text-[10px] text-muted">×{pesos[key]}</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={20}
                    value={comp[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className={cn(fieldCls, 'w-20 text-right')}
                  />
                </div>
              ))}
            </div>

            {/* Competencias con rúbrica (Fase 12 tarea 2): 8 competencias, catálogo editable en
                competencias_config — nunca hardcodeado. La nota se deriva, no se escribe a mano. */}
            <div className="border-t border-line/60 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Competencias <span className="ml-1 tabular-nums text-[10px] text-muted">×{pesos.competencias}</span>
                </span>
                <span className="tabular-nums text-sm font-semibold text-navy">{competenciaNota.toFixed(1)}/20</span>
              </div>
              {competenciasConfig.length === 0 ? (
                <p className="text-xs text-muted">Sin catálogo de competencias todavía (falta aplicar la migración 0057) — la nota queda en 0.</p>
              ) : (
                <div className="space-y-3">
                  {competenciasConfig.map((c) => (
                    <div key={c.cod}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-navy">{c.nombre}</span>
                        {competenciaSel[c.cod] === undefined && (
                          <span className="text-[11px] text-muted">sin responder</span>
                        )}
                      </div>
                      <OpcionBotones
                        opciones={c.rubrica.map((texto, i) => ({ value: String(i), label: `${i} · ${texto}` }))}
                        value={competenciaSel[c.cod] === undefined ? '' : String(competenciaSel[c.cod])}
                        onChange={(v) => setCompetenciaSel((p) => ({ ...p, [c.cod]: Number(v) }))}
                        ariaLabel={c.nombre}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-line/60 pt-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <label className="flex-1 text-sm text-navy">Descuento por incidencias</label>
                <input type="number" step="0.5" value={comp.descuentoIncidencias} onChange={(e) => set('descuentoIncidencias', Number(e.target.value))} className={cn(fieldCls, 'w-20 text-right')} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1 text-sm text-navy">Bonus por ventas</label>
                <input type="number" step="0.5" value={comp.bonusVentas} onChange={(e) => set('bonusVentas', Number(e.target.value))} className={cn(fieldCls, 'w-20 text-right')} />
              </div>
            </div>

            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={guardar}
                disabled={!empleadoId || !ciclo || competenciasFaltantes > 0}
                pending={pending}
                aria-describedby="motivo-evaluacion"
              >
                {pending ? 'Guardando…' : `Guardar · ${nota.toFixed(2)}`}
              </Button>
              <span id="motivo-evaluacion" className="text-xs text-muted">
                {competenciasFaltantes > 0
                  ? `Faltan ${competenciasFaltantes} de ${competenciasConfig.length} competencias.`
                  : 'La nota usa los pesos de Configuración y se guarda un snapshot.'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nota de referencia (R4, spec §2.6): aparece justo después de guardar, misma pantalla.
          Ya NO registra ningún pago — hasta el 23-ago-2026 este panel sugería un monto con la
          fórmula vieja (salario_base) y escribía en la tabla `pagos`, un segundo camino de pago
          que contradecía «la liquidación ES el pago» (ROTURA 2, validador de flujo). El pago vive
          ahora en la pestaña de la persona; acá sólo queda la nota como referencia para el
          administrador. */}
      {esAdmin && evalGuardada && (
        <Card>
          <CardHeader>
            <CardTitle>Evaluación guardada — {evalGuardada.nombre}</CardTitle>
            <Badge tone={TRAMO_TONE[tramoEval(evalGuardada.notaFinal)]}>
              {evalGuardada.notaFinal.toFixed(2)} · {TRAMO_LABEL[tramoEval(evalGuardada.notaFinal)]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted">Ciclo {evalGuardada.cicloDesde} a {evalGuardada.cicloHasta}.</p>

            <p className="rounded-lg border border-line bg-paper/60 px-3 py-2.5 text-sm text-ink">
              El pago se registra en la pestaña{' '}
              <Link
                href={`/personal/${evalGuardada.empleadoId}/pago`}
                className="font-medium text-navy underline decoration-gold decoration-2 underline-offset-2 hover:text-navy-dark"
              >
                Liquidación y pago
              </Link>{' '}
              de la persona.
            </p>

            <button type="button" onClick={reiniciar} className="block text-xs text-muted underline underline-offset-2 hover:text-navy">
              Nueva evaluación
            </button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-10 pl-5">
                  <span className="sr-only">Desglose</span>
                </TH>
                <TH>Mes</TH>
                <TH>Empleado</TH>
                <TH className="text-right">Nota</TH>
                <TH className="pr-5">Tramo</TH>
              </TR>
            </THead>
            <TBody>
              {filtradas.map((e) => {
                const t = tramoEval(e.notaFinal);
                const abierta = expandida === e.id;
                return (
                  <Fragment key={e.id}>
                    <TR
                      onClick={() => setExpandida(abierta ? null : e.id)}
                      className="cursor-pointer"
                    >
                      <TD className="pl-5">
                        <button
                          type="button"
                          aria-expanded={abierta}
                          aria-label={`Ver desglose de ${e.empleadoNombre ?? 'evaluación'} ${e.mes}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setExpandida(abierta ? null : e.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted outline-none transition-colors duration-150 hover:bg-navy/5 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/70"
                        >
                          <ChevronRight
                            className={cn('h-4 w-4 transition-transform duration-200 ease-out-expo', abierta && 'rotate-90')}
                            strokeWidth={2}
                          />
                        </button>
                      </TD>
                      <TD className="tabular-nums text-xs text-muted">{e.mes}</TD>
                      <TD className="font-medium text-navy">{e.empleadoNombre ?? '—'}</TD>
                      <TD className="text-right tabular-nums text-base font-bold text-navy">{e.notaFinal.toFixed(2)}</TD>
                      <TD className="pr-5">
                        <Badge tone={TRAMO_TONE[t]}>{TRAMO_LABEL[t]}</Badge>
                      </TD>
                    </TR>
                    {abierta && (
                      <TR className="hover:bg-transparent">
                        <TD colSpan={5} className="bg-paper/50 px-6 py-4">
                          {e.componentes ? (
                            <PerfilComponentes componentes={e.componentes} pesos={e.pesosUsados ?? (pesos as unknown as Record<string, number>)} />
                          ) : (
                            <p className="text-xs text-muted">Esta evaluación no guardó desglose por componente.</p>
                          )}
                        </TD>
                      </TR>
                    )}
                  </Fragment>
                );
              })}
              {filtradas.length === 0 && (
                <TR>
                  <TD colSpan={5}>
                    <EmptyState icon={Award} titulo={evaluaciones.length === 0 ? 'Sin evaluaciones registradas' : 'Ninguna coincide con el filtro'} compacto>
                      {evaluaciones.length === 0
                        ? 'Crea la primera evaluación del mes con "Nueva evaluación".'
                        : 'Prueba con otro mes, tramo o nombre.'}
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
