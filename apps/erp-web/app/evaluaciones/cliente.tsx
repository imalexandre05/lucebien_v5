'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function mesPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).slice(0, 7);
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

  const nota = useMemo(() => calcularNotaMensual(comp, pesos), [comp, pesos]);
  const tramo = tramoEval(nota);

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
      {esAdmin && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setAbierto((v) => !v)} className={buttonVariants({ variant: abierto ? 'outline' : 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            {abierto ? 'Cerrar' : 'Nueva evaluación'}
          </button>
        </div>
      )}

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
        <CardContent className="px-0 pb-0">
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
              {evaluaciones.map((e) => {
                const t = tramoEval(e.notaFinal);
                return (
                  <TR key={e.id}>
                    <TD className="pl-5 font-mono text-xs">{e.mes}</TD>
                    <TD>{e.empleadoNombre ?? '—'}</TD>
                    <TD className="text-right font-mono tabular-nums">{e.notaFinal.toFixed(2)}</TD>
                    <TD className="pr-5">
                      <Badge tone={TRAMO_TONE[t]}>{TRAMO_LABEL[t]}</Badge>
                    </TD>
                  </TR>
                );
              })}
              {evaluaciones.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={4}>
                    Sin evaluaciones registradas.
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
