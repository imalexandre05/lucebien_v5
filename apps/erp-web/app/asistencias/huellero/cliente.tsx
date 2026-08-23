'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fingerprint, AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import {
  accionCrearDispositivo,
  accionMapear,
  accionCerrarMapeo,
  accionBorrarMapeo,
  accionCompletarDia,
} from './actions';
import type {
  DispositivoHuellero,
  MapeoHuellero,
  SinAsignar,
  DiaPendiente,
} from '../../../lib/huellero-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { campoCls } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

type Emp = { id: string; nombre: string };

const fieldCls = campoCls;

// Seis ciclos de cinco minutos. Antes de eso, un reinicio de la PC no debería alarmar a nadie.
const MINUTOS_PARA_ALARMA = 30;

export function HuelleroCliente({
  dispositivos,
  mapeos,
  sinAsignar,
  pendientes,
  empleados,
}: {
  dispositivos: DispositivoHuellero[];
  mapeos: MapeoHuellero[];
  sinAsignar: SinAsignar[];
  pendientes: DiaPendiente[];
  empleados: Emp[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  function correr(fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) {
    setError('');
    setAviso('');
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'No se pudo completar');
      else {
        setAviso(r.mensaje ?? 'Listo');
        router.refresh();
      }
    });
  }

  // Los días marcados para revisar y los que sólo esperan la hora de salida son problemas
  // distintos: el primero necesita una decisión, el segundo un dato.
  const { aRevisar, sinSalida } = useMemo(() => {
    const rev: DiaPendiente[] = [];
    const sal: DiaPendiente[] = [];
    for (const d of pendientes) {
      if ((d.obs ?? '').startsWith('revisar:')) rev.push(d);
      else sal.push(d);
    }
    return { aRevisar: rev, sinSalida: sal };
  }, [pendientes]);

  return (
    <div className="space-y-6">
      {Boolean(error) && (
        <div className="rounded-md border border-error-line bg-error-soft px-3 py-2 text-sm text-error-deep">
          {error}
        </div>
      )}
      {Boolean(aviso) && (
        <div className="rounded-md border border-exito-line bg-exito-soft px-3 py-2 text-sm text-exito-deep">
          {aviso}
        </div>
      )}

      <Equipos dispositivos={dispositivos} correr={correr} pending={pending} />

      <ColaSinAsignar
        sinAsignar={sinAsignar}
        empleados={empleados}
        correr={correr}
        pending={pending}
      />

      <DiasSinSalida dias={sinSalida} correr={correr} pending={pending} />

      <DiasARevisar dias={aRevisar} />

      <MapeosVigentes mapeos={mapeos} correr={correr} pending={pending} />
    </div>
  );
}

// ── Equipos ────────────────────────────────────────────────────────────────────────────────

function Equipos({
  dispositivos,
  correr,
  pending,
}: {
  dispositivos: DispositivoHuellero[];
  correr: (fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pending: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ip, setIp] = useState('');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Equipos</CardTitle>
        <Button variant="ghost" onClick={() => setAbierto((v) => !v)}>
          <Plus className="h-4 w-4" /> Agregar equipo
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {abierto && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-cream/40 p-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Almacén" className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Dirección en la red</label>
              <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.220" className={fieldCls} />
            </div>
            <Button
              disabled={pending}
              onClick={() => {
                correr(() => accionCrearDispositivo({ nombre, ip, sedeCod: '' }));
                setNombre('');
                setIp('');
                setAbierto(false);
              }}
            >
              Guardar
            </Button>
            <p className="w-full text-xs text-muted">
              La contraseña del equipo no se guarda acá: vive sólo en la computadora que lo lee.
            </p>
          </div>
        )}

        {dispositivos.length === 0 ? (
          <EmptyState icon={Fingerprint} titulo="Todavía no hay ningún equipo">
            Agregá el huellero para que el colector sepa dónde escribir.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {dispositivos.map((d) => {
              const caido = d.minutosDesdeSync === null || d.minutosDesdeSync > MINUTOS_PARA_ALARMA;
              return (
                <div key={d.id} className="rounded-md border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-navy">{d.nombre}</span>
                    <Badge tone={caido ? 'red' : 'green'}>{caido ? 'Sin señal' : 'Al día'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{d.ip}</p>
                  <p className="mt-1 text-xs text-muted">
                    {d.ultimaSincronizacion === null
                      ? 'Nunca sincronizó'
                      : `Última señal hace ${d.minutosDesdeSync} min`}
                  </p>
                  {caido && (
                    <p className="mt-2 text-xs text-error-deep">
                      El colector no da señales. Revisá que la computadora del almacén esté
                      encendida y con internet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Cola de identificadores sin asignar ────────────────────────────────────────────────────

function ColaSinAsignar({
  sinAsignar,
  empleados,
  correr,
  pending,
}: {
  sinAsignar: SinAsignar[];
  empleados: Emp[];
  correr: (fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pending: boolean;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [desde, setDesde] = useState<Record<string, string>>({});

  if (sinAsignar.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Identificadores sin asignar</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Check} titulo="No queda ninguno sin asignar">
            Todas las marcas que llegaron tienen dueño.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identificadores sin asignar ({sinAsignar.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted">
          Marcas que llegaron pero que todavía no corresponden a nadie. Nada se pierde: al asignar
          el identificador, sus marcas viejas entran solas.
        </p>
        <Table>
          <THead>
            <TR>
              <TH>Identificador</TH>
              <TH>Nombre en el equipo</TH>
              <TH className="text-right">Marcas</TH>
              <TH>Desde</TH>
              <TH>Asignar a</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {sinAsignar.map((s) => {
              const clave = `${s.dispositivoId}::${s.employeeNo}`;
              const reasignado = s.nombresEquipo.length > 1;
              return (
                <TR key={clave}>
                  <TD className="font-mono text-xs">{s.employeeNo}</TD>
                  <TD>
                    {s.nombresEquipo.join(', ') || <span className="text-muted">sin nombre</span>}
                    {reasignado && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-aviso-deep">
                        <AlertTriangle className="h-3 w-3" />
                        El equipo usó este número para más de una persona: asignalo por tramos de
                        fecha, uno por cada una.
                      </p>
                    )}
                  </TD>
                  <TD className="text-right">{s.marcas}</TD>
                  <TD className="text-xs text-muted">{s.primeraMarca.slice(0, 10)}</TD>
                  <TD>
                    <select
                      value={sel[clave] ?? ''}
                      onChange={(e) => setSel((p) => ({ ...p, [clave]: e.target.value }))}
                      className={cn(fieldCls, 'w-44')}
                    >
                      <option value="">Elegir…</option>
                      <option value="__ignorar__">— Ignorar este identificador —</option>
                      {empleados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={desde[clave] ?? s.primeraMarca.slice(0, 10)}
                      onChange={(e) => setDesde((p) => ({ ...p, [clave]: e.target.value }))}
                      className={cn(fieldCls, 'mt-1 w-44')}
                      title="Desde qué fecha vale esta asignación"
                    />
                  </TD>
                  <TD>
                    <Button
                      disabled={pending || !sel[clave]}
                      onClick={() =>
                        correr(() =>
                          accionMapear({
                            dispositivoId: s.dispositivoId,
                            employeeNo: s.employeeNo,
                            empleadoId: sel[clave] === '__ignorar__' ? '' : (sel[clave] ?? ''),
                            ignorado: sel[clave] === '__ignorar__',
                            vigenteDesde: desde[clave] ?? s.primeraMarca.slice(0, 10),
                            vigenteHasta: '',
                            nota: '',
                          }),
                        )
                      }
                    >
                      Asignar
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Días sin marca de salida ───────────────────────────────────────────────────────────────

function DiasSinSalida({
  dias,
  correr,
  pending,
}: {
  dias: DiaPendiente[];
  correr: (fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pending: boolean;
}) {
  const [salidas, setSalidas] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Días sin hora de salida ({dias.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {dias.length === 0 ? (
          <EmptyState icon={Check} titulo="No hay días a medias">
            Todos los días con marca tienen entrada y salida.
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              La persona marcó al llegar pero no al irse. Mientras el día siga así, el sueldo de
              ese mes no se puede calcular: hay que poner la hora a mano.
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Persona</TH>
                  <TH>Fecha</TH>
                  <TH>Entrada</TH>
                  <TH>Salida</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {dias.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.empleadoNombre ?? <span className="text-muted">sin nombre</span>}</TD>
                    <TD>{d.fecha}</TD>
                    <TD className="font-mono text-xs">{d.horaEntrada ?? '—'}</TD>
                    <TD>
                      <input
                        type="time"
                        value={salidas[d.id] ?? ''}
                        onChange={(e) => setSalidas((p) => ({ ...p, [d.id]: e.target.value }))}
                        className={cn(fieldCls, 'w-28')}
                      />
                    </TD>
                    <TD>
                      <Button
                        disabled={pending || !salidas[d.id]}
                        onClick={() =>
                          correr(() =>
                            accionCompletarDia({
                              empleadoId: d.empleadoId,
                              fecha: d.fecha,
                              turno: d.turno,
                              horaEntrada: d.horaEntrada ?? '',
                              horaSalida: salidas[d.id] ?? '',
                            }),
                          )
                        }
                      >
                        Completar
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Días marcados para revisar ─────────────────────────────────────────────────────────────

function DiasARevisar({ dias }: { dias: DiaPendiente[] }) {
  if (dias.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Días que necesitan una decisión ({dias.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted">
          El sistema guardó las horas pero no dio el día por trabajado, porque el resultado no
          puede ser cierto o porque el identificador cambió de dueño ese día. Corregilo desde
          <Link href="/asistencias" className="ml-1 underline">
            Asistencias
          </Link>
          .
        </p>
        <Table>
          <THead>
            <TR>
              <TH>Persona</TH>
              <TH>Fecha</TH>
              <TH>Entrada</TH>
              <TH>Salida</TH>
              <TH>Motivo</TH>
            </TR>
          </THead>
          <TBody>
            {dias.map((d) => (
              <TR key={d.id}>
                <TD>{d.empleadoNombre ?? <span className="text-muted">sin nombre</span>}</TD>
                <TD>{d.fecha}</TD>
                <TD className="font-mono text-xs">{d.horaEntrada ?? '—'}</TD>
                <TD className="font-mono text-xs">{d.horaSalida ?? '—'}</TD>
                <TD className="text-xs text-aviso-deep">{(d.obs ?? '').replace(/^revisar:\s*/, '')}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Mapeos vigentes ────────────────────────────────────────────────────────────────────────

function MapeosVigentes({
  mapeos,
  correr,
  pending,
}: {
  mapeos: MapeoHuellero[];
  correr: (fn: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>) => void;
  pending: boolean;
}) {
  const [cierres, setCierres] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identificadores asignados ({mapeos.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {mapeos.length === 0 ? (
          <EmptyState icon={Fingerprint} titulo="Todavía no asignaste ninguno">
            Los identificadores que asignes van a aparecer acá.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Identificador</TH>
                <TH>Persona</TH>
                <TH>Desde</TH>
                <TH>Hasta</TH>
                <TH>Cerrar en</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {mapeos.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.employeeNo}</TD>
                  <TD>
                    {m.ignorado ? (
                      <Badge tone="gray">Ignorado</Badge>
                    ) : (
                      (m.empleadoNombre ?? <span className="text-muted">sin nombre</span>)
                    )}
                  </TD>
                  <TD className="text-xs">{m.vigenteDesde}</TD>
                  <TD className="text-xs">
                    {m.vigenteHasta ?? <span className="text-muted">sigue vigente</span>}
                  </TD>
                  <TD>
                    {m.vigenteHasta === null && (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={cierres[m.id] ?? ''}
                          onChange={(e) => setCierres((p) => ({ ...p, [m.id]: e.target.value }))}
                          className={cn(fieldCls, 'w-36')}
                        />
                        <Button
                          variant="ghost"
                          disabled={pending || !cierres[m.id]}
                          onClick={() =>
                            correr(() =>
                              accionCerrarMapeo({
                                mapeoId: m.id,
                                vigenteHasta: cierres[m.id] ?? '',
                              }),
                            )
                          }
                        >
                          Cerrar
                        </Button>
                      </div>
                    )}
                  </TD>
                  <TD>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        correr(() =>
                          accionBorrarMapeo({
                            mapeoId: m.id,
                            dispositivoId: m.dispositivoId,
                            employeeNo: m.employeeNo,
                          }),
                        )
                      }
                      title="Sus marcas vuelven a la cola"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
