'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Filter } from 'lucide-react';
import { accionCrearAsistencia, accionEliminarAsistencia } from './actions';
import type { Asistencia } from '../../lib/asistencias-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

type Emp = { id: string; nombre: string };

const FUENTE_TONE: Record<string, Tone> = { manual: 'gray', reporte: 'navy', huellero: 'green' };
const TURNOS = ['M', 'T', 'C'];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function hoyPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function StatBox({ label, valor, tone }: { label: string; valor: number | string; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-4 text-center', tone)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-mono text-2xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

export function AsistenciasCliente({
  asistencias,
  empleados,
  esAdmin,
}: {
  asistencias: Asistencia[];
  empleados: Emp[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState('');
  const [fecha, setFecha] = useState(hoyPeru());
  const [turno, setTurno] = useState('M');
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [tardanza, setTardanza] = useState(0);
  const [obs, setObs] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // Filtros.
  const [q, setQ] = useState('');
  const [fFecha, setFFecha] = useState('');
  const [fTurno, setFTurno] = useState('');
  const [fFuente, setFFuente] = useState('');

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return asistencias.filter((a) => {
      if (fFecha && a.fecha !== fFecha) return false;
      if (fTurno && a.turno !== fTurno) return false;
      if (fFuente && a.fuente !== fFuente) return false;
      if (needle && !`${a.empleadoNombre ?? ''} ${a.obs ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [asistencias, q, fFecha, fTurno, fFuente]);

  const resumen = useMemo(
    () => ({
      total: filtradas.length,
      aTiempo: filtradas.filter((a) => a.minutosTardanza <= 0).length,
      conTardanza: filtradas.filter((a) => a.minutosTardanza > 0).length,
      minutos: filtradas.reduce((s, a) => s + a.minutosTardanza, 0),
    }),
    [filtradas],
  );

  function registrar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearAsistencia({
        empleadoId,
        fecha,
        turno,
        horaEntrada,
        horaSalida,
        minutosTardanza: tardanza,
        obs,
      });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setAbierto(false);
      setEmpleadoId('');
      setHoraEntrada('');
      setHoraSalida('');
      setTardanza(0);
      setObs('');
      router.refresh();
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar este registro de asistencia?')) return;
    startTransition(async () => {
      const r = await accionEliminarAsistencia(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Registros" valor={resumen.total} tone="border-navy/15 bg-navy/5 text-navy" />
        <StatBox label="A tiempo" valor={resumen.aTiempo} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox label="Con tardanza" valor={resumen.conTardanza} tone="border-amber-200 bg-amber-50 text-amber-700" />
        <StatBox label="Min. tardanza" valor={resumen.minutos} tone="border-line bg-white text-muted" />
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
          <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className={fieldCls} aria-label="Fecha" />
          <select value={fTurno} onChange={(e) => setFTurno(e.target.value)} className={fieldCls} aria-label="Turno">
            <option value="">Todos los turnos</option>
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={fFuente} onChange={(e) => setFFuente(e.target.value)} className={fieldCls} aria-label="Fuente">
            <option value="">Toda fuente</option>
            <option value="manual">Manual</option>
            <option value="reporte">Reporte</option>
            <option value="huellero">Huellero</option>
          </select>
          {esAdmin && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {abierto ? 'Cerrar' : 'Registrar asistencia'}
            </button>
          )}
        </CardContent>
      </Card>

      {esAdmin && abierto && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar asistencia</CardTitle>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Turno</label>
                  <select value={turno} onChange={(e) => setTurno(e.target.value)} className={cn(fieldCls, 'w-full')}>
                    {TURNOS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hora entrada</label>
                  <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hora salida</label>
                  <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tardanza (min)</label>
                <input type="number" value={tardanza} onChange={(e) => setTardanza(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Observación</label>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={cn(fieldCls, 'w-full')} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={registrar}
              disabled={pending || !empleadoId}
              className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}
            >
              {pending ? 'Registrando…' : 'Registrar'}
            </button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Empleado</TH>
                <TH>Turno</TH>
                <TH>Entrada</TH>
                <TH>Salida</TH>
                <TH className="text-right">Tardanza</TH>
                <TH>Fuente</TH>
                {esAdmin && <TH className="pr-5" />}
              </TR>
            </THead>
            <TBody>
              {filtradas.map((a) => (
                <TR key={a.id}>
                  <TD className="pl-5 font-mono text-xs text-muted">{a.fecha}</TD>
                  <TD>
                    <div className="font-medium text-navy">{a.empleadoNombre ?? '—'}</div>
                    {a.obs && <div className="text-xs text-muted">{a.obs}</div>}
                  </TD>
                  <TD>
                    <Badge tone="navy">{a.turno}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{a.horaEntrada ?? '—'}</TD>
                  <TD className="font-mono text-xs">{a.horaSalida ?? '—'}</TD>
                  <TD className="text-right">
                    {a.minutosTardanza > 0 ? (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-mono text-xs font-medium tabular-nums',
                          a.minutosTardanza > 15 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
                        )}
                      >
                        {a.minutosTardanza} min
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={FUENTE_TONE[a.fuente] ?? 'gray'}>{a.fuente}</Badge>
                  </TD>
                  {esAdmin && (
                    <TD className="pr-5 text-right">
                      <button type="button" onClick={() => eliminar(a.id)} className="text-muted transition-colors hover:text-red-600" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
              {filtradas.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={esAdmin ? 8 : 7}>
                    {asistencias.length === 0 ? 'Sin asistencias registradas.' : 'Ninguna coincide con el filtro.'}
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
