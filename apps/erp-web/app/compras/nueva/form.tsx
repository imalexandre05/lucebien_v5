'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { totalCompra } from '@scilb/core';
import { crearCompraAction } from '../actions';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

const fieldCls =
  'rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy placeholder:text-slate-400 focus:border-navy focus:outline-none';

const soles = (n: number) => `S/ ${new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

type MaterialOpt = { id: string; nombre: string; sedeCod: string; unidad: string; costoPromedio: number };
type Fila = { materialId: string; cantidad: number; costoUnitario: number };

export function NuevaCompraForm({
  proveedores,
  materiales,
  sedes,
  miSede,
}: {
  proveedores: { id: string; nombre: string }[];
  materiales: MaterialOpt[];
  sedes: string[];
  miSede: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [proveedorId, setProveedorId] = useState('');
  const [sede, setSede] = useState(miSede || sedes[0] || '');
  const [obs, setObs] = useState('');
  const [filas, setFilas] = useState<Fila[]>([{ materialId: '', cantidad: 1, costoUnitario: 0 }]);
  const [error, setError] = useState<string | null>(null);

  // Los materiales pertenecen a una sede: solo se ofrecen los de la sede elegida.
  const materialesSede = useMemo(() => materiales.filter((m) => m.sedeCod === sede), [materiales, sede]);
  const total = totalCompra(filas.map((f) => ({ cantidad: f.cantidad, costoUnitario: f.costoUnitario })));

  const setFila = (i: number, patch: Partial<Fila>) =>
    setFilas((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function elegirMaterial(i: number, materialId: string) {
    const m = materialesSede.find((x) => x.id === materialId);
    // Sugerir el último costo promedio como punto de partida (editable).
    setFila(i, { materialId, costoUnitario: m && m.costoPromedio > 0 ? m.costoPromedio : filas[i].costoUnitario });
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const err = await crearCompraAction({
        proveedorId: proveedorId || null,
        sedeCod: sede,
        obs,
        items: filas.map((f) => ({ materialId: f.materialId, cantidad: f.cantidad, costoUnitario: f.costoUnitario })),
      });
      if (err) setError(err);
      else {
        router.push('/compras');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <Link href="/compras" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver a compras
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Proveedor</span>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={cn(fieldCls, 'w-full')}>
                <option value="">— Sin especificar —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Sede</span>
              <select
                value={sede}
                onChange={(e) => {
                  setSede(e.target.value);
                  setFilas([{ materialId: '', cantidad: 1, costoUnitario: 0 }]);
                }}
                className={cn(fieldCls, 'w-full')}
              >
                {sedes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          {materialesSede.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              La sede {sede} no tiene materiales registrados.{' '}
              <Link href="/materiales" className="font-medium underline">
                Crea materiales
              </Link>{' '}
              antes de comprar.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_5.5rem_7rem_6rem_2rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
                <span>Material</span>
                <span className="text-right">Cantidad</span>
                <span className="text-right">Costo unit.</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>
              {filas.map((f, i) => {
                const sub = f.cantidad * f.costoUnitario;
                return (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5.5rem_7rem_6rem_2rem] sm:items-center">
                    <select value={f.materialId} onChange={(e) => elegirMaterial(i, e.target.value)} className={cn(fieldCls, 'w-full')}>
                      <option value="">— Material —</option>
                      {materialesSede.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre} ({m.unidad})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={f.cantidad}
                      onChange={(e) => setFila(i, { cantidad: Number(e.target.value) })}
                      className={cn(fieldCls, 'w-full text-right')}
                      aria-label="Cantidad"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={f.costoUnitario}
                      onChange={(e) => setFila(i, { costoUnitario: Number(e.target.value) })}
                      className={cn(fieldCls, 'w-full text-right')}
                      aria-label="Costo unitario"
                    />
                    <span className="text-right font-mono text-sm tabular-nums text-navy">{soles(sub)}</span>
                    <button
                      type="button"
                      onClick={() => setFilas((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))}
                      className="justify-self-end text-muted transition-colors hover:text-red-600"
                      aria-label="Quitar fila"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setFilas((p) => [...p, { materialId: '', cantidad: 1, costoUnitario: 0 }])}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-navy transition-colors hover:border-gold"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar material
              </button>
            </div>
          )}

          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observación (opcional)" className={cn(fieldCls, 'w-full')} />

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">
              Total de la compra:{' '}
              <span className="font-mono text-lg font-semibold tabular-nums text-[#7a6e0e]">{soles(total)}</span>
            </span>
            <Button
              type="button"
              onClick={guardar}
              disabled={materialesSede.length === 0}
              pending={pending}
              className="py-2.5"
            >
              {!pending && <Save className="h-4 w-4" strokeWidth={2} />}
              {pending ? 'Guardando…' : 'Registrar compra'}
            </Button>
          </div>
          <p className="text-xs text-muted">Se registra como “por recibir”. El stock sube cuando la marques como recibida en la lista de compras.</p>
        </CardContent>
      </Card>
    </div>
  );
}
