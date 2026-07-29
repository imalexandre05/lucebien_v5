'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, FileText, Filter } from 'lucide-react';
import { sugerirMontoPago } from '@scilb/core';
import { accionCrearPago, accionEliminarPago } from './actions';
import type { Pago, EmpleadoPago } from '../../lib/pagos-repo';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { OpcionBotones, type Opcion } from '../../components/ui/opcion-botones';
import { StatBox } from '../../components/ui/stat-box';
import { cn } from '../../lib/cn';
import { hoyPeru } from '../../lib/fechas';

const ESTADO_TONE: Record<string, Tone> = { pagado: 'green', pendiente: 'amber', anulado: 'gray' };
const OPC_METODO: Opcion[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'yape', label: 'Yape' },
  { value: 'transferencia', label: 'Transferencia' },
];
const OPC_FILTRO_METODO: Opcion[] = [{ value: '', label: 'Todo método' }, ...OPC_METODO];
const OPC_ESTADO_PAGO: Opcion[] = [
  { value: 'pagado', label: 'Pagado' },
  { value: 'pendiente', label: 'Pendiente' },
];
const OPC_FILTRO_ESTADO: Opcion[] = [
  { value: '', label: 'Todo estado' },
  ...OPC_ESTADO_PAGO,
  { value: 'anulado', label: 'Anulado' },
];
const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold';
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

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

  // Filtros.
  const [q, setQ] = useState('');
  const [fMetodo, setFMetodo] = useState('');
  const [fEstado, setFEstado] = useState('');

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pagos.filter((p) => {
      if (fMetodo && p.metodo !== fMetodo) return false;
      if (fEstado) {
        if (fEstado === 'anulado' && !p.anulado) return false;
        if (fEstado !== 'anulado' && (p.anulado || p.estado !== fEstado)) return false;
      }
      if (needle && !(p.empleadoNombre ?? '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [pagos, q, fMetodo, fEstado]);

  const resumen = useMemo(() => {
    const pagado = filtrados.filter((p) => !p.anulado && p.estado === 'pagado').reduce((s, p) => s + p.monto, 0);
    const pendiente = filtrados.filter((p) => !p.anulado && p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);
    const anulados = filtrados.filter((p) => p.anulado).length;
    return { total: filtrados.length, pagado, pendiente, anulados };
  }, [filtrados]);

  // Fase 12 tarea 5: misma fórmula que /evaluaciones (sugerirMontoPago del core, puerto literal de
  // routes/pagos.js:107-139) — antes esta pantalla tenía su propio cálculo suelto, sin el clamp
  // ≥ 0 que sí pedía el plan. Una sola fuente de verdad para la sugerencia en todo el ERP.
  const emp = empleados.find((e) => e.id === empleadoId);
  const sugerido = emp ? sugerirMontoPago(emp.salarioBase, emp.ultimaNota, bonus, descuentos) : null;

  function elegirEmpleado(id: string) {
    setEmpleadoId(id);
    const e = empleados.find((x) => x.id === id);
    if (e) setMonto(sugerirMontoPago(e.salarioBase, e.ultimaNota, bonus, descuentos));
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
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox size="md" index={0} label="Registros" valor={String(resumen.total)} tone="border-navy/15 bg-navy/5 text-navy" />
        <StatBox size="md" index={1} label="Pagado" valor={soles(resumen.pagado)} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatBox size="md" index={2} label="Pendiente" valor={soles(resumen.pendiente)} tone="border-amber-200 bg-amber-50 text-amber-700" />
        <StatBox size="md" index={3} label="Anulados" valor={String(resumen.anulados)} tone="border-line bg-white text-muted" />
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
          <OpcionBotones opciones={OPC_FILTRO_METODO} value={fMetodo} onChange={setFMetodo} ariaLabel="Método" />
          <OpcionBotones opciones={OPC_FILTRO_ESTADO} value={fEstado} onChange={setFEstado} ariaLabel="Estado" />
          {esAdmin && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className={cn(buttonVariants({ variant: abierto ? 'outline' : 'primary' }), 'ml-auto')}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {abierto ? 'Cerrar' : 'Registrar pago'}
            </button>
          )}
        </CardContent>
      </Card>

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
                    Salario base {soles(emp.salarioBase)} · última nota {emp.ultimaNota != null ? emp.ultimaNota.toFixed(2) : '—'}
                    {sugerido != null && <> · sugerido <span className="font-medium text-navy">{soles(sugerido)}</span></>}
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
                  <OpcionBotones opciones={OPC_METODO} value={metodo} onChange={setMetodo} ariaLabel="Método" />
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
                  <OpcionBotones opciones={OPC_ESTADO_PAGO} value={estado} onChange={setEstado} ariaLabel="Estado" />
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
            <Button type="button" onClick={registrar} disabled={!empleadoId} pending={pending}>
              {pending ? 'Registrando…' : `Registrar · ${soles(monto)}`}
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
                <TH>Método</TH>
                <TH>Estado</TH>
                <TH className="text-right">Monto</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {filtrados.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5 font-mono text-xs text-muted">{p.fechaPago ?? p.createdAt.slice(0, 10)}</TD>
                  <TD className="font-medium text-navy">{p.empleadoNombre ?? '—'}</TD>
                  <TD className="capitalize">{p.metodo}</TD>
                  <TD>
                    <Badge tone={ESTADO_TONE[p.anulado ? 'anulado' : p.estado] ?? 'gray'}>{p.anulado ? 'anulado' : p.estado}</Badge>
                  </TD>
                  <TD className="text-right font-mono font-semibold tabular-nums">{soles(p.monto)}</TD>
                  <TD className="pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/pagos/${p.id}/comprobante`} className="text-muted transition-colors hover:text-navy" aria-label="Comprobante" title="Comprobante">
                        <FileText className="h-4 w-4" strokeWidth={1.75} />
                      </Link>
                      {esAdmin && (
                        <button type="button" onClick={() => eliminar(p.id)} className="text-muted transition-colors hover:text-red-600" aria-label="Eliminar">
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={6}>
                    {pagos.length === 0 ? 'Sin pagos registrados.' : 'Ninguno coincide con el filtro.'}
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
