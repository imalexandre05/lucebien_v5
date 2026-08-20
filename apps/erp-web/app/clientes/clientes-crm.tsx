'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Filter, Star, RefreshCw } from 'lucide-react';
import type { ClienteCRM, SegmentoCliente } from '../../lib/crm-repo';
import { eliminarCliente } from './actions';
import { Card, CardContent } from '../../components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '../../components/ui/table';
import { StatBox } from '../../components/ui/stat-box';
import { cn } from '../../lib/cn';

const SEG: Record<SegmentoCliente, { label: string; cls: string }> = {
  vip: { label: 'VIP', cls: 'bg-gold/20 text-gold-deep' },
  recurrente: { label: 'Recurrente', cls: 'bg-navy/10 text-navy' },
  nuevo: { label: 'Nuevo', cls: 'bg-ink/10 text-muted' },
};

export function ClientesCRM({ clientes }: { clientes: ClienteCRM[] }) {
  const [q, setQ] = useState('');
  const [fSeg, setFSeg] = useState('');

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clientes.filter((c) => {
      if (fSeg && c.segmento !== fSeg) return false;
      if (needle && !`${c.nombre} ${c.dni} ${c.telefono}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [clientes, q, fSeg]);

  const resumen = useMemo(
    () => ({
      total: clientes.length,
      vip: clientes.filter((c) => c.segmento === 'vip').length,
      recurrentes: clientes.filter((c) => c.segmento === 'recurrente').length,
      seguir: clientes.filter((c) => c.seguir).length,
    }),
    [clientes],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox index={0} label="Clientes" valor={resumen.total} tone="navy" />
        <StatBox index={1} label="VIP" valor={resumen.vip} tone="gold" />
        <StatBox index={2} label="Recurrentes" valor={resumen.recurrentes} tone="navy" />
        <StatBox index={3} label="A reactivar" valor={resumen.seguir} tone="aviso" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Filter className="h-3.5 w-3.5" strokeWidth={2} /> Filtros
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, DNI o teléfono…"
            className="min-w-[14rem] flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none transition-colors focus:border-gold"
          />
          <select
            value={fSeg}
            onChange={(e) => setFSeg(e.target.value)}
            className="rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-navy outline-none focus:border-gold"
            aria-label="Segmento"
          >
            <option value="">Todos los segmentos</option>
            <option value="vip">VIP</option>
            <option value="recurrente">Recurrente</option>
            <option value="nuevo">Nuevo</option>
          </select>
          <span className="ml-auto font-mono text-xs text-muted tabular-nums">{filtrados.length} clientes</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Cliente</TH>
                <TH>Sede</TH>
                <TH className="text-right">Pedidos</TH>
                <TH className="text-right">Total gastado</TH>
                <TH>Último</TH>
                <TH>Segmento</TH>
                <TH className="pr-5" />
              </TR>
            </THead>
            <TBody>
              {filtrados.map((c) => {
                const seg = SEG[c.segmento];
                return (
                  <TR key={c.id}>
                    <TD className="pl-5">
                      <Link href={`/clientes/${c.id}`} className="font-medium text-navy transition-colors duration-150 hover:text-gold">
                        {c.nombre}
                      </Link>
                      {(c.telefono || c.dni) && (
                        <div className="font-mono text-[11px] text-muted">{c.telefono || c.dni}</div>
                      )}
                    </TD>
                    <TD className="font-mono text-xs">{c.sedeCod || '—'}</TD>
                    <TD className="text-right font-mono tabular-nums">{c.pedidos}</TD>
                    <TD className="text-right font-mono tabular-nums">S/ {c.totalGastado.toFixed(2)}</TD>
                    <TD className="font-mono text-xs text-muted">
                      {c.ultimoPedido ?? '—'}
                      {c.seguir && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-aviso-soft px-1.5 py-0.5 text-[10px] font-medium text-aviso-deep">
                          <RefreshCw className="h-2.5 w-2.5" strokeWidth={2.5} /> reactivar
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', seg.cls)}>
                        {c.segmento === 'vip' && <Star className="h-3 w-3" strokeWidth={2.5} />}
                        {seg.label}
                      </span>
                    </TD>
                    <TD className="pr-5 text-right">
                      <form action={eliminarCliente}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="cursor-pointer text-xs text-muted transition-colors duration-150 hover:text-error">
                          Eliminar
                        </button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
              {filtrados.length === 0 && (
                <TR>
                  <TD className="px-5 py-8 text-center text-muted" colSpan={7}>
                    {clientes.length === 0 ? 'Sin clientes todavía.' : 'Ninguno coincide con el filtro.'}
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
