'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, CalendarClock, Search, X } from 'lucide-react';
import { TIPOS_PEDIDO, type Pedido, type PedidoInput, type TipoPedido, type ActivoInventario } from '@scilb/core';
import { accionCrearPedido } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { Badge, type Tone } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/modal';
import { EmptyState } from '../../components/ui/empty-state';
import { ShoppingBag } from 'lucide-react';
import { cn } from '../../lib/cn';

const TIPO_TONE: Record<TipoPedido, Tone> = { alquiler: 'navy', venta: 'gold', servicio: 'green', confeccion: 'amber' };
const TIPO_LABEL: Record<TipoPedido, string> = { alquiler: 'Alquiler', venta: 'Venta', servicio: 'Servicio', confeccion: 'Confección' };

const fieldCls =
  'w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm text-navy outline-none transition-colors focus:border-gold';

const hoy = () => new Date().toISOString().slice(0, 10);

const vacio = (): PedidoInput => ({
  clienteId: '',
  tipo: 'alquiler',
  sedeCod: '',
  activoId: '',
  descripcion: '',
  fecha: hoy(),
  fechaDevolucion: '',
  fechaEntrega: '',
  notas: '',
  garantiaMonto: 0,
  tela: '',
  fechaPrueba: '',
  fechaSegundaPrueba: '',
  total: 0,
});

function precioSugerido(tipo: TipoPedido, a: ActivoInventario): number {
  if (tipo === 'alquiler') return a.precioAlquiler;
  if (tipo === 'venta') return a.precioVenta;
  return a.precioBase;
}

// Selector de activo con buscador — mismo patrón visual del PersonaPicker (components/ui/
// persona-picker.tsx): buscar → filas → elegir. Autocompleta sede y precio sugerido del pedido.
function ActivoPicker({
  activos,
  activoId,
  onPick,
}: {
  activos: ActivoInventario[];
  activoId: string;
  onPick: (a: ActivoInventario | null) => void;
}) {
  const [q, setQ] = useState('');
  const elegido = activos.find((a) => a.id === activoId) ?? null;
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = n ? activos.filter((a) => `${a.codigo} ${a.tipo} ${a.talla} ${a.color}`.toLowerCase().includes(n)) : activos;
    return base.slice(0, 30);
  }, [activos, q]);

  if (elegido) {
    return (
      <div className="flex items-center justify-between rounded-md border border-line bg-navy/5 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-navy">{elegido.codigo}</p>
          <p className="truncate text-xs text-muted">
            {elegido.tipo} {elegido.talla} · {elegido.color} · sede {elegido.sedeCod}
          </p>
        </div>
        <button type="button" onClick={() => onPick(null)} className="shrink-0 text-muted transition-colors hover:text-red-600" aria-label="Quitar activo">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line">
      <div className="relative border-b border-line">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código, tipo, talla, color…"
          className="w-full bg-white py-2 pl-9 pr-3 text-sm text-navy outline-none placeholder:text-muted"
        />
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {filtrados.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onPick(a)}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-paper"
          >
            <span className="font-mono">{a.codigo}</span>
            <span className="text-xs text-muted">
              {a.tipo} {a.talla} · {a.color}
            </span>
          </button>
        ))}
        {filtrados.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted">Sin coincidencias — puede ser un servicio sin activo.</p>}
      </div>
    </div>
  );
}

export function PedidosCliente({
  pedidosIniciales,
  clientes,
  activos,
  sedes,
}: {
  pedidosIniciales: Pedido[];
  clientes: { id: string; nombre: string }[];
  activos: ActivoInventario[];
  sedes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<PedidoInput>(vacio());
  const [error, setError] = useState('');

  const pedidos = pedidosIniciales;

  function abrir() {
    setError('');
    setForm(vacio());
    setAbierto(true);
  }
  function cerrar() {
    if (pending) return;
    setAbierto(false);
    setError('');
  }

  function setCampo<K extends keyof PedidoInput>(campo: K, valor: PedidoInput[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }
  function setTipo(t: TipoPedido) {
    const activo = activos.find((a) => a.id === form.activoId);
    setForm((f) => ({ ...f, tipo: t, total: activo ? precioSugerido(t, activo) : f.total }));
  }
  function onPickActivo(a: ActivoInventario | null) {
    if (!a) {
      setForm((f) => ({ ...f, activoId: '' }));
      return;
    }
    setForm((f) => ({ ...f, activoId: a.id, sedeCod: f.sedeCod || a.sedeCod, total: precioSugerido(f.tipo, a) }));
  }

  function guardar() {
    setError('');
    startTransition(async () => {
      const r = await accionCrearPedido(form);
      if (!r.ok) {
        setError(r.error ?? 'Error al crear el pedido');
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{pedidos.length} pedido(s) registrados</p>
        <div className="flex items-center gap-2">
          <Link href="/pedidos/devoluciones" className={buttonVariants({ variant: 'outline' })}>
            <CalendarClock className="h-4 w-4" strokeWidth={2} />
            Devoluciones
          </Link>
          <button type="button" onClick={abrir} className={buttonVariants({ variant: 'primary' })}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo pedido
          </button>
        </div>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Tipo</TH>
                <TH>Detalle</TH>
                <TH>Fecha</TH>
                <TH>Devolución / Entrega</TH>
                <TH>Estado</TH>
                <TH className="pr-5 text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {pedidos.map((p) => (
                <TR key={p.id}>
                  <TD className="pl-5">
                    <Link href={`/pedidos/${p.id}`} className="font-medium text-navy transition-colors duration-150 hover:text-gold">
                      {p.clienteNombre ?? '—'}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={TIPO_TONE[p.tipo]}>{TIPO_LABEL[p.tipo]}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{p.detalle}</TD>
                  <TD className="font-mono text-muted">{p.fecha}</TD>
                  <TD className="font-mono text-muted">{p.fechaDevolucion || p.fechaEntrega || '—'}</TD>
                  <TD className="capitalize">{p.estado}</TD>
                  <TD className="pr-5 text-right font-mono tabular-nums">S/ {p.total.toFixed(2)}</TD>
                </TR>
              ))}
              {pedidos.length === 0 && (
                <TR>
                  <TD colSpan={7} className="px-5 py-10">
                    <EmptyState icon={ShoppingBag} titulo="Sin pedidos todavía">
                      Usa &ldquo;Nuevo pedido&rdquo; para crear el primero.
                    </EmptyState>
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={abierto} onClose={cerrar} title="Nuevo pedido" subtitle="Alquiler, venta, servicio o confección" size="lg">
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Cliente</label>
              <select value={form.clienteId} onChange={(e) => setCampo('clienteId', e.target.value)} className={fieldCls}>
                <option value="">Selecciona un cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_PEDIDO.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      form.tipo === t ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
                    )}
                  >
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Activo (alquiler / venta / confección — vacío para servicio sobre prenda del cliente)
            </label>
            <ActivoPicker activos={activos} activoId={form.activoId ?? ''} onPick={onPickActivo} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Sede</label>
              <select value={form.sedeCod} onChange={(e) => setCampo('sedeCod', e.target.value)} className={fieldCls}>
                <option value="">Elige…</option>
                {sedes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setCampo('fecha', e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Total (S/)</label>
              <input type="number" step="0.01" value={form.total} onChange={(e) => setCampo('total', Number(e.target.value))} className={fieldCls} />
            </div>
          </div>

          {form.tipo === 'servicio' && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Descripción del servicio</label>
              <input value={form.descripcion} onChange={(e) => setCampo('descripcion', e.target.value)} placeholder="ej. Lavado en seco de saco" className={fieldCls} />
            </div>
          )}

          {form.tipo === 'alquiler' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de devolución</label>
                <input type="date" value={form.fechaDevolucion} onChange={(e) => setCampo('fechaDevolucion', e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Garantía (S/)</label>
                <input type="number" step="0.01" value={form.garantiaMonto} onChange={(e) => setCampo('garantiaMonto', Number(e.target.value))} className={fieldCls} />
                <p className="mt-1 text-[11px] text-muted">Regístrala también en Caja al cobrarla.</p>
              </div>
            </div>
          )}

          {form.tipo === 'venta' && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de entrega</label>
              <input type="date" value={form.fechaEntrega} onChange={(e) => setCampo('fechaEntrega', e.target.value)} className={fieldCls} />
              <p className="mt-1 text-[11px] text-muted">El adelanto se registra en Caja al cobrarlo.</p>
            </div>
          )}

          {form.tipo === 'confeccion' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tela</label>
                <input value={form.tela} onChange={(e) => setCampo('tela', e.target.value)} placeholder="ej. Lana inglesa gris" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de prueba</label>
                <input type="date" value={form.fechaPrueba} onChange={(e) => setCampo('fechaPrueba', e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">2ª prueba</label>
                <input type="date" value={form.fechaSegundaPrueba} onChange={(e) => setCampo('fechaSegundaPrueba', e.target.value)} className={fieldCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de entrega</label>
                <input type="date" value={form.fechaEntrega} onChange={(e) => setCampo('fechaEntrega', e.target.value)} className={fieldCls} />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Notas de ajuste (para el equipo)</label>
            <textarea
              value={form.notas}
              onChange={(e) => setCampo('notas', e.target.value)}
              placeholder="Qué necesita esta prenda: arreglos, detalles a cuidar…"
              rows={2}
              className={fieldCls}
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={cerrar} disabled={pending} className={buttonVariants({ variant: 'ghost' })}>
            Cancelar
          </button>
          <Button
            type="button"
            onClick={guardar}
            disabled={!form.clienteId || !form.sedeCod || !form.fecha}
            pending={pending}
          >
            {pending ? 'Guardando…' : 'Crear pedido'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
