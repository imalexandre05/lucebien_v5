'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, HeartHandshake } from 'lucide-react';
import { VALORES, LIKERT_LABELS, type PuntajeValores } from '@scilb/core';
import { accionEnviarValores } from './actions';
import type { CompaneroValor, MiResumenValores, SeguimientoValorFila } from '../../lib/valores-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { tonoAvatar } from '../../components/colaboradores/avatar';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { EmptyState } from '../../components/ui/empty-state';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { ReauthGate } from '../../components/ui/reauth-gate';
import { Aviso } from '../../components/ui/form';
import { cn } from '../../lib/cn';

// SIN RESPUESTA POR DEFECTO, Y ES EL CAMBIO QUE MÁS IMPORTA DE ESTA PANTALLA.
//
// Antes los seis valores arrancaban en 3. Eso tenía dos costos y los dos van a la nota: se podía
// abrir, tocar Guardar y mandar seis treses sin haber evaluado nada; y un 3 puesto a propósito era
// indistinguible de un 3 que nadie tocó. La nota de Valores 360° entra a la evaluación mensual, así
// que ese ruido termina en el sueldo de alguien.
//
// Ahora se arranca vacío y no se puede guardar hasta contestar los seis. El atajo «Todos a N» sigue
// estando: quien de verdad puntúa igual en todo lo dice con un acto explícito, que no es lo mismo
// que un formulario que lo eligió por él.
type PuntajeParcial = Partial<PuntajeValores>;

const SIN_PUNTAJE: PuntajeParcial = {};

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
  const [puntaje, setPuntaje] = useState<PuntajeParcial>(SIN_PUNTAJE);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const pendientes = companeros.filter((c) => !c.evaluado).length;

  function abrir(c: CompaneroValor) {
    setAbierto(c);
    setPuntaje(SIN_PUNTAJE);
    setError('');
  }

  function todosA(v: number) {
    setPuntaje({ integridad: v, respeto: v, honestidad: v, amabilidad: v, relacion: v, actitud: v });
  }

  // Cuántos de los seis están contestados. Es lo que habilita el botón y lo que se muestra arriba
  // del formulario: sin eso, "no me deja guardar" no tiene explicación a la vista.
  const contestados = VALORES.filter(({ key }) => puntaje[key] != null).length;
  const completo = contestados === VALORES.length;

  function guardar() {
    if (!abierto || !completo) return;
    setError('');
    startTransition(async () => {
      const r = await accionEnviarValores(abierto.id, mes, puntaje as PuntajeValores);
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
        <Aviso tono="aviso" className="text-sm">
          {avisoVentanaCerrada}
        </Aviso>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Compañeros" valor={companeros.length} tone="navy" />
        <StatBox
          index={1}
          label="Pendientes"
          valor={pendientes}
          tone={pendientes > 0 ? 'border-aviso-line bg-aviso-soft text-aviso-deep' : 'border-exito-line bg-exito-soft text-exito-deep'}
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
              'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors',
              vista === 'evaluar' ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
            )}
          >
            Evaluar compañeros
          </button>
          <button
            type="button"
            onClick={() => setVista('seguimiento')}
            className={cn(
              'rounded-r-pastilla border px-3 py-1.5 text-xs font-medium transition-colors',
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
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-r-pastilla text-xs font-semibold',
                          tonoAvatar(c.nombre),
                        )}
                      >
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
                        <TD className="text-right tabular-nums">{f.recibidas}</TD>
                        <TD className="text-right tabular-nums">
                          {f.enviadas}/{f.debeEnviar}
                        </TD>
                        <TD className="text-right">
                          <Badge tone={f.cumplimiento >= 1 ? 'green' : f.cumplimiento >= 0.5 ? 'amber' : 'gray'}>
                            {Math.round(f.cumplimiento * 100)}%
                          </Badge>
                        </TD>
                        <TD className="pr-5 text-right tabular-nums font-semibold">
                          {f.nota20 != null ? f.nota20.toFixed(1) : '—'}
                        </TD>
                      </TR>
                    ))}
                    {seguimiento.filas.length === 0 && (
                      <TR>
                        <TD className="p-0" colSpan={5}>
                          <EmptyState icon={HeartHandshake} titulo="Sin colaboradores activos" compacto>
                            El seguimiento se arma con el directorio de gente activa. Si alguien
                            falta, revisa su estado en Empleados.
                          </EmptyState>
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
          {/* El progreso de los seis, arriba de todo: es lo que explica por qué el botón está
              gris, y lo dice antes de que la persona llegue abajo a descubrirlo. */}
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-r-pastilla bg-line/70">
              <div
                className="h-full origin-left bg-gold transition-transform duration-200 ease-out-expo"
                style={{ transform: `scaleX(${contestados / VALORES.length})` }}
              />
            </div>
            <span className="shrink-0 tabular-nums text-xs text-muted">
              {contestados}/{VALORES.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-rotulo font-semibold uppercase text-muted">Atajo</span>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => todosA(v)}
                className="rounded-r-pastilla border border-line px-2.5 py-1 text-xs text-navy transition-colors hover:border-gold"
              >
                Todos a {v}
              </button>
            ))}
          </div>
          {VALORES.map(({ key, label }) => (
            <div key={key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-navy">{label}</span>
                {puntaje[key] == null && <span className="text-micro text-muted">sin responder</span>}
              </div>
              <OpcionBotones
                opciones={OPC_LIKERT}
                value={puntaje[key] == null ? '' : String(puntaje[key])}
                onChange={(v) => setPuntaje((p) => ({ ...p, [key]: Number(v) }))}
                ariaLabel={label}
              />
            </div>
          ))}
          {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}
        </ModalBody>
        <ModalFooter>
          <span id="motivo-valores" className="mr-auto text-xs text-muted">
            {completo
              ? 'Quién puntuó qué no se muestra a nadie.'
              : `Faltan ${VALORES.length - contestados} de ${VALORES.length}.`}
          </span>
          <Button type="button" variant="outline" onClick={() => setAbierto(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={guardar}
            disabled={!completo}
            pending={pending}
            aria-describedby="motivo-valores"
          >
            {pending ? 'Guardando…' : 'Guardar evaluación'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
