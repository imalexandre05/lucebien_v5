'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { accionCrearPago, accionEliminarPago } from './actions';
import type { Pago, EmpleadoPago } from '../../lib/pagos-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/cn';

const ESTADO_TONE: Record<string, Tone> = { pagado: 'green', pendiente: 'amber', anulado: 'gray' };
const METODOS = ['efectivo', 'yape', 'transferencia'];
const ESTADOS = ['pagado', 'pendiente'];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';

function hoyPeru(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function PagosCliente({
  pagos,
  empleados,
  esAdmin,
}: {
  pagos: Pago[];
  empleados: EmpleadoPago[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [empleadoId, setEmpleadoId] = useState('');
  const [monto, setMonto] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [descuentos, setDescuentos] = useState(0);
  const [metodo, setMetodo] = useState('efectivo');
  const [estado, setEstado] = useState('pagado');
  const [fecha, setFecha] = useState(hoyPeru());
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const emp = empleados.find((e) => e.id === empleadoId);
  const sugerido = emp && emp.ultimaNota != null ? r2(emp.salarioBase * (emp.ultimaNota / 20) + bonus - descuentos) : null;

  function elegirEmpleado(id: string) {
    setEmpleadoId(id);
    const e = empleados.find((x) => x.id === id);
    if (e && e.ultimaNota != null) setMonto(r2(e.salarioBase * (e.ultimaNota / 20) + bonus - descuentos));
  }

  function registrar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearPago({ empleadoId, monto, bonus, descuentos, metodo, estado, fechaPago: fecha });
      if (!r.ok) {
        setError(r.error ?? 'Error');
        return;
      }
      setAbierto(false);
      setEmpleadoId('');
      setMonto(0);
      setBonus(0);
      setDescuentos(0);
      router.refresh();
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar este pago?')) return;
    startTransition(async () => {
      const r = await accionEliminarPago(id);
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
            {abierto ? 'Cerrar' : 'Registrar pago'}
          </button>
        </div>
      )}

      {esAdmin && abierto && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Empleado</label>
                <select value={empleadoId} onChange={(e) => elegirEmpleado(e.target.value)} className={cn(fieldCls, 'w-full')}>
                  <option value="">Elige…</option>
                  {empleados.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
                {emp && (
                  <p className="mt-1 text-xs text-muted">
                    Salario base S/ {emp.salarioBase.toFixed(2)} · última nota {emp.ultimaNota != null ? emp.ultimaNota.toFixed(2) : '—'}
                    {sugerido != null && <> · sugerido <span className="font-medium text-navy">S/ {sugerido.toFixed(2)}</span></>}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Método</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={cn(fieldCls, 'w-full')}>
                    {METODOS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Bonus</label>
                  <input type="number" step="0.5" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descuentos</label>
                  <input type="number" step="0.5" value={descuentos} onChange={(e) => setDescuentos(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Estado</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className={cn(fieldCls, 'w-full')}>
                    {ESTADOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto (S/)</label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.5" value={monto} onChange={(e) => setMonto(Number(e.target.value))} className={cn(fieldCls, 'w-full')} />
                  {sugerido != null && (
                    <button type="button" onClick={() => setMonto(sugerido)} className="whitespace-nowrap rounded-md border border-line px-2 py-1 text-xs text-navy hover:border-gold">
                      Usar sugerido
                    </button>
                  )}
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" onClick={registrar} disabled={pending || !empleadoId} className={cn(buttonVariants({ variant: 'primary' }), pending && 'opacity-60')}>
              {pending ? 'Registrando…' : `Registrar · S/ ${monto.toFixed(2)}`}
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
                <TH>Método</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Monto</TH>
                {esAdmin && <TH className="pr-5" />}
              </TR>
            </THead>
            <TBody>
              {pagos.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5 font-mono text-xs">{p.fechaPago ?? p.createdAt.slice(0, 10)}</TD>
                  <TD>{p.empleadoNombre ?? '—'}</TD>
                  <TD className="capitalize">{p.metodo}</TD>
                  <TD>
                    <Badge tone={ESTADO_TONE[p.anulado ? 'anulado' : p.estado] ?? 'gray'}>{p.anulado ? 'anulado' : p.estado}</Badge>
                  </TD>
                  <TD className="pr-5 text-right font-mono tabular-nums">S/ {p.monto.toFixed(2)}</TD>
                  {esAdmin && (
                    <TD className="pr-5 text-right">
                      <button type="button" onClick={() => eliminar(p.id)} className="text-muted hover:text-red-600" aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
              {pagos.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={esAdmin ? 6 : 5}>
                    Sin pagos registrados.
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
