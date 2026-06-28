'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
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
      {esAdmin && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setAbierto((v) => !v)} className={buttonVariants({ variant: abierto ? 'outline' : 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            {abierto ? 'Cerrar' : 'Registrar asistencia'}
          </button>
        </div>
      )}

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
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Fecha</TH>
                <TH>Empleado</TH>
                <TH>Turno</TH>
                <TH>Entrada</TH>
                <TH className="text-right">Tardanza</TH>
                <TH>Fuente</TH>
                {esAdmin && <TH className="pr-5" />}
              </TR>
            </THead>
            <TBody>
              {asistencias.map((a) => (
                <TR key={a.id}>
                  <TD className="pl-5 font-mono text-xs">{a.fecha}</TD>
                  <TD>{a.empleadoNombre ?? '—'}</TD>
                  <TD>{a.turno}</TD>
                  <TD className="font-mono text-xs">{a.horaEntrada ?? '—'}</TD>
                  <TD className="text-right font-mono tabular-nums">
                    {a.minutosTardanza > 0 ? <Badge tone="amber">{a.minutosTardanza} min</Badge> : '—'}
                  </TD>
                  <TD>
                    <Badge tone={FUENTE_TONE[a.fuente] ?? 'gray'}>{a.fuente}</Badge>
                  </TD>
                  {esAdmin && (
                    <TD className="pr-5 text-right">
                      <button type="button" onClick={() => eliminar(a.id)} className="text-muted hover:text-red-600" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
              {asistencias.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={esAdmin ? 7 : 6}>
                    Sin asistencias registradas.
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
