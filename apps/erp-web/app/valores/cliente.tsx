'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, HeartHandshake, AlertTriangle } from 'lucide-react';
import { VALORES, LIKERT_LABELS, type PuntajeValores } from '@scilb/core';
import { accionEnviarValores } from './actions';
import type { CompaneroValor, MiResumenValores, SeguimientoValorFila } from '../../lib/valores-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { cn } from '../../lib/cn';

const DEFAULT_PUNTAJE: PuntajeValores = {
  integridad: 3,
  respeto: 3,
  honestidad: 3,
  amabilidad: 3,
  relacion: 3,
  actitud: 3,
};

// Botones 1-5 con el nombre Likert al lado (public/js/data.js:87) — "Botones > selects".
const OPC_LIKERT: Opcion[] = LIKERT_LABELS.map((label, i) => ({ value: String(i + 1), label: `${i + 1} · ${label}` }));

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

type Seguimiento = {
  filas: SeguimientoValorFila[];
  totalEmpleados: number;
  totalEvaluaciones: number;
  cumplimientoGlobal: number;
};

export function ValoresCliente({
  mes,
  companeros,
  miResumen,
  esAdmin,
  seguimiento,
  seguimientoBloqueado,
  avisoVentanaCerrada,
}: {
  mes: string;
  companeros: CompaneroValor[];
  miResumen: MiResumenValores;
  esAdmin: boolean;
  seguimiento: Seguimiento | null;
  seguimientoBloqueado: boolean;
  // Fase 13 tarea 3: null cuando el módulo está abierto (default, sin cambios de comportamiento).
  // Con texto: el admin activó una ventana de días desde /configuracion y hoy cae fuera — se
  // avisa ANTES de abrir el modal en vez de dejar que el usuario llene todo y falle al enviar.
  avisoVentanaCerrada?: string | null;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<'evaluar' | 'seguimiento'>('evaluar');
  const [abierto, setAbierto] = useState<CompaneroValor | null>(null);
  const [puntaje, setPuntaje] = useState<PuntajeValores>(DEFAULT_PUNTAJE);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const pendientes = companeros.filter((c) => !c.evaluado).length;

  function abrir(c: CompaneroValor) {
    setAbierto(c);
    setPuntaje(DEFAULT_PUNTAJE);
    setError('');
  }

  function todosA(v: number) {
    setPuntaje({ integridad: v, respeto: v, honestidad: v, amabilidad: v, relacion: v, actitud: v });
  }

  function guardar() {
    if (!abierto) return;
    setError('');
    startTransition(async () => {
      const r = await accionEnviarValores(abierto.id, mes, puntaje);
      if (!r.ok) {
        setError(r.error ?? 'Error al guardar');
        return;
      }
      setAbierto(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {avisoVentanaCerrada && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <p>{avisoVentanaCerrada}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Compañeros" valor={companeros.length} tone="navy" />
        <StatBox
          index={1}
          label="Pendientes"
          valor={pendientes}
          tone={pendientes > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}
        />
        <StatBox index={2} label="Recibidas (yo)" valor={miResumen.recibidas} tone="neutro" />
        <StatBox
          index={3}
          label="Mi nota /20"
          valor={miResumen.nota20 != null ? miResumen.nota20.toFixed(1) : '—'}
          tone="gold"
        />
      </div>

      {esAdmin && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setVista('evaluar')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              vista === 'evaluar' ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
            )}
          >
            Evaluar compañeros
          </button>
          <button
            type="button"
            onClick={() => setVista('seguimiento')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              vista === 'seguimiento' ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
            )}
          >
            Seguimiento del equipo
          </button>
        </div>
      )}

      {vista === 'evaluar' && (
        <Card>
          <CardHeader>
            <CardTitle>Evalúa a tus compañeros — {mes}</CardTitle>
            <Badge tone={pendientes > 0 ? 'amber' : 'green'}>
              {companeros.length - pendientes}/{companeros.length} evaluados
            </Badge>
          </CardHeader>
          <CardContent className={companeros.length ? 'px-0 pb-0' : 'pb-0'}>
            {companeros.length === 0 ? (
              <EmptyState icon={HeartHandshake} titulo="Sin compañeros que evaluar" compacto>
                No hay otros colaboradores activos registrados todavía.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line/60">
                {companeros.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={c.evaluado}
                      onClick={() => abrir(c)}
                      className={cn(
                        'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
                        c.evaluado ? 'cursor-default opacity-60' : 'hover:bg-navy/5',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-semibold text-navy">
                        {iniciales(c.nombre)}
                      </span>
                      <span className="flex-1 text-sm font-medium text-navy">{c.nombre}</span>
                      {c.evaluado ? (
                        <Badge tone="green">
                          <CheckCircle2 className="mr-1 h-3 w-3" strokeWidth={2} />
                          Evaluado
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted">Evaluar →</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {vista === 'seguimiento' &&
        esAdmin &&
        (seguimientoBloqueado ? (
          <ReauthGate mensaje="Seguimiento agrega notas de desempeño de todo el equipo." />
        ) : seguimiento ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatBox index={0} label="Empleados" valor={seguimiento.totalEmpleados} tone="navy" />
              <StatBox index={1} label="Evaluaciones" valor={seguimiento.totalEvaluaciones} tone="neutro" />
              <StatBox
                index={2}
                label="Cumplimiento"
                valor={`${Math.round(seguimiento.cumplimientoGlobal * 100)}%`}
                tone="gold"
              />
            </div>
            <Card>
              <CardContent className="overflow-x-auto px-0 pb-0">
                <Table>
                  <THead>
                    <TR>
                      <TH className="pl-5">Empleado</TH>
                      <TH className="text-right">Recibidas</TH>
                      <TH className="text-right">Enviadas</TH>
                      <TH className="text-right">Cumplimiento</TH>
                      <TH className="pr-5 text-right">Nota /20</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {seguimiento.filas.map((f) => (
                      <TR key={f.id}>
                        <TD className="pl-5 font-medium text-navy">{f.nombre}</TD>
                        <TD className="text-right font-mono tabular-nums">{f.recibidas}</TD>
                        <TD className="text-right font-mono tabular-nums">
                          {f.enviadas}/{f.debeEnviar}
                        </TD>
                        <TD className="text-right">
                          <Badge tone={f.cumplimiento >= 1 ? 'green' : f.cumplimiento >= 0.5 ? 'amber' : 'gray'}>
                            {Math.round(f.cumplimiento * 100)}%
                          </Badge>
                        </TD>
                        <TD className="pr-5 text-right font-mono font-semibold tabular-nums">
                          {f.nota20 != null ? f.nota20.toFixed(1) : '—'}
                        </TD>
                      </TR>
                    ))}
                    {seguimiento.filas.length === 0 && (
                      <TR>
                        <TD className="px-5 py-8 text-center text-muted" colSpan={5}>
                          Sin empleados activos que mostrar.
                        </TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null)}

      <Modal open={Boolean(abierto)} onClose={() => setAbierto(null)} title={abierto ? `Evaluar a ${abierto.nombre}` : ''} subtitle={mes} size="lg">
        <ModalBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Atajo</span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => todosA(v)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-navy transition-colors hover:border-gold"
              >
                Todos a {v}
              </button>
            ))}
          </div>
          {VALORES.map(({ key, label }) => (
            <div key={key}>
              <div className="mb-1.5 text-sm font-medium text-navy">{label}</div>
              <OpcionBotones opciones={OPC_LIKERT} value={String(puntaje[key])} onChange={(v) => setPuntaje((p) => ({ ...p, [key]: Number(v) }))} ariaLabel={label} />
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setAbierto(null)}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} pending={pending}>
            {pending ? 'Guardando…' : 'Guardar evaluación'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
