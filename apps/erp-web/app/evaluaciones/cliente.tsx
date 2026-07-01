'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Filter } from 'lucide-react';
import {
  COMPONENTES,
  calcularNotaMensual,
  tramoEval,
  TRAMO_LABEL,
  type ComponentesEval,
  type PesosEval,
  type TramoEval,
} from '@scilb/core';
import { accionCrearEvaluacion, accionComponentesEval } from './actions';
import type { Evaluacion } from '../../lib/evaluaciones-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string };

const TRAMO_TONE: Record<TramoEval, Tone> = {
  excelente: 'green',
  bueno: 'navy',
  mejorar: 'amber',
  bajo: 'gray',
};
const TRAMOS: TramoEval[] = ['excelente', 'bueno', 'mejorar', 'bajo'];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function mesPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).slice(0, 7);
}

function StatBox({ label, valor, tone }: { label: string; valor: number | string; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-2xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

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

export function EvaluacionesCliente({
  evaluaciones,
  empleados,
  pesos,
  esAdmin,
}: {
  evaluaciones: Evaluacion[];
  empleados: Emp[];
  pesos: PesosEval;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState('');
  const [mes, setMes] = useState(mesPeru());
  const [comp, setComp] = useState<ComponentesEval>(CERO);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Filtros.
  const [q, setQ] = useState('');
  const [fMes, setFMes] = useState('');
  const [fTramo, setFTramo] = useState('');

  const nota = useMemo(() => calcularNotaMensual(comp, pesos), [comp, pesos]);
  const tramo = tramoEval(nota);

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

  function calcularDesdeData() {
    setError('');
    startTransition(async () => {
      const r = await accionComponentesEval(empleadoId, mes);
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
      }));
    });
  }

  function guardar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearEvaluacion({
        empleadoId,
        mes,
        notaFinal: nota,
        componentes: comp as unknown as Record<string, number>,
        pesos,
      });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setAbierto(false);
      setEmpleadoId('');
      setComp(CERO);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Evaluaciones" valor={resumen.total} tone="border-navy/15 bg-navy/5 text-navy" />
        <StatBox label="Promedio" valor={resumen.promedio} tone="border-gold/30 bg-gold/10 text-[#7a6e0e]" />
        <StatBox label="Excelente" valor={resumen.excelente} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox label="Bajo" valor={resumen.bajo} tone="border-line bg-white text-muted" />
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
              onClick={() => setAbierto((v) => !v)}
              className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {abierto ? 'Cerrar' : 'Nueva evaluación'}
            </button>
          )}
        </CardContent>
      </Card>

      {esAdmin && abierto && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva evaluación</CardTitle>
            <Badge tone={TRAMO_TONE[tramo]}>
              {nota.toFixed(2)} · {TRAMO_LABEL[tramo]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Empleado</label>
                <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">Elige…</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Mes</label>
                <input value={mes} onChange={(e) => setMes(e.target.value)} placeholder="2026-06" className={cn(fieldCls, 'w-full')} />
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-line/60 pt-3">
              <button
                type="button"
                onClick={calcularDesdeData}
                disabled={pending || !empleadoId}
                className={cn(buttonVariants({ variant: 'outline' }), 'text-xs', pending && 'opacity-60')}
              >
                Calcular desde la data
              </button>
              <span className="text-xs text-muted">
                Llena operaciones/software/limpieza (reportes evaluados como encargado), tardanza y descuento.
              </span>
            </div>

            <div className="text-xs uppercase tracking-wide text-muted">Componentes (escala /20)</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COMPONENTES.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="flex-1 text-sm text-navy">
                    {label}
                    <span className="ml-1 font-mono text-[10px] text-muted">×{pesos[key]}</span>
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

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="button" onClick={guardar} disabled={pending || !empleadoId} className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}>
                {pending ? 'Guardando…' : `Guardar · ${nota.toFixed(2)}`}
              </button>
              <span className="text-xs text-muted">La nota usa los pesos de Configuración y se guarda un snapshot.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Mes</TH>
                <TH>Empleado</TH>
                <TH className="text-right">Nota</TH>
                <TH className="pr-5">Tramo</TH>
              </TR>
            </THead>
            <TBody>
              {filtradas.map((e) => {
                const t = tramoEval(e.notaFinal);
                return (
                  <TR key={e.id}>
                    <TD className="pl-5 font-mono text-xs text-muted">{e.mes}</TD>
                    <TD className="font-medium text-navy">{e.empleadoNombre ?? '—'}</TD>
                    <TD className="text-right font-mono text-base font-bold tabular-nums text-navy">{e.notaFinal.toFixed(2)}</TD>
                    <TD className="pr-5">
                      <Badge tone={TRAMO_TONE[t]}>{TRAMO_LABEL[t]}</Badge>
                    </TD>
                  </TR>
                );
              })}
              {filtradas.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={4}>
                    {evaluaciones.length === 0 ? 'Sin evaluaciones registradas.' : 'Ninguna coincide con el filtro.'}
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
