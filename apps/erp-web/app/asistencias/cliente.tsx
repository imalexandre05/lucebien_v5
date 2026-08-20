'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Filter, Fingerprint } from 'lucide-react';
import { TURNO_LABEL } from '@scilb/core';
import { accionCrearAsistencia, accionEliminarAsistencia } from './actions';
import type { Asistencia } from '../../lib/asistencias-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { cn } from '../../lib/cn';
import { hoyPeru } from '../../lib/fechas';

type Emp = { id: string; nombre: string };

const FUENTE_TONE: Record<string, Tone> = { manual: 'gray', reporte: 'navy', huellero: 'green' };

// La condición decide si el día ENTRA en la liquidación: `sueldo_entrada` filtra los 'sin_dato'
// (0073_sueldos_rpc.sql:180). Un día a medias no es un detalle cosmético — bloquea el cálculo
// del mes entero hasta que alguien lo complete.
const CONDICION_TONE: Record<string, Tone> = {
  trabajado: 'green',
  sin_dato: 'amber',
  falta: 'red',
};
const CONDICION_LABEL: Record<string, string> = {
  trabajado: 'Completo',
  sin_dato: 'A medias',
  falta: 'Falta',
};
const TURNOS = ['M', 'T', 'C'];
const OPC_TURNO: Opcion[] = TURNOS.map((t) => ({ value: t, label: TURNO_LABEL[t as 'M' | 'T' | 'C'] }));
const OPC_FILTRO_TURNO: Opcion[] = [{ value: '', label: 'Todos los turnos' }, ...OPC_TURNO];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

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

  // `minutosTardanza` es una columna HEREDADA y ya no se muestra. La liquidación no la lee:
  // calcula la tardanza comparando la hora de entrada contra el horario contratado
  // (sueldos.ts:572-577). Y el huellero la deja siempre en 0, así que la pantalla mostraba
  // "0 min de tardanza" al lado de una entrada de las 09:05. Es preferible no decir nada a
  // decir algo falso.
  const resumen = useMemo(
    () => ({
      total: filtradas.length,
      declarados: filtradas.filter((a) => a.condicion === 'trabajado').length,
      aMedias: filtradas.filter((a) => a.condicion === 'sin_dato').length,
      faltas: filtradas.filter((a) => a.condicion === 'falta').length,
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
        <StatBox index={0} label="Registros" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="Días completos" valor={resumen.declarados} tone="exito" />
        <StatBox index={2} label="A medias" valor={resumen.aMedias} tone="aviso" />
        <StatBox index={3} label="Faltas" valor={resumen.faltas} tone="neutro" />
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
          <OpcionBotones opciones={OPC_FILTRO_TURNO} value={fTurno} onChange={setFTurno} ariaLabel="Turno" />
          <select value={fFuente} onChange={(e) => setFFuente(e.target.value)} className={fieldCls} aria-label="Fuente">
            <option value="">Toda fuente</option>
            <option value="manual">Manual</option>
            <option value="reporte">Reporte</option>
            <option value="huellero">Huellero</option>
          </select>
          {esAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/asistencias/huellero"
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                <Fingerprint className="h-4 w-4" strokeWidth={2} />
                Huellero
              </Link>
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }))}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                {abierto ? 'Cerrar' : 'Registrar asistencia'}
              </button>
            </div>
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
                  <OpcionBotones opciones={OPC_TURNO} value={turno} onChange={setTurno} ariaLabel="Turno" />
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
            <Button type="button" onClick={registrar} disabled={!empleadoId} pending={pending}>
              {pending ? 'Registrando…' : 'Registrar'}
            </Button>
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
                <TH>Estado</TH>
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
                  <TD>
                    <Badge tone={CONDICION_TONE[a.condicion] ?? 'gray'}>
                      {CONDICION_LABEL[a.condicion] ?? a.condicion}
                    </Badge>
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
