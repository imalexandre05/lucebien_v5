'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ETAPAS_CONFECCION, type Pedido, type EstadoPedido, type EtapaConfeccion } from '@scilb/core';
import { accionCambiarEstadoPedido, accionActualizarEtapaConfeccion, accionAnularPedido } from '../actions';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Aviso } from '../../../components/ui/form';
import { cn } from '../../../lib/cn';

const ETAPA_LABEL: Record<EtapaConfeccion, string> = { corte: 'Corte', armado: 'Armado', ajuste: 'Ajuste', entrega: 'Entrega' };

// Transiciones de estado a botones directos (sin modal — es una sola acción, no un formulario) y,
// si hay líneas de confección, el avance por sus etapas propias (E4: corte→armado→ajuste→entrega).
// Fase 8: la etapa vive por LÍNEA (pedido_items.etapa_confeccion) — un pedido puede llevar 2+
// prendas a medida con pruebas distintas — así que se muestra un control por cada línea de
// confección, no uno solo para todo el pedido como antes.
export function PedidoAcciones({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function cambiarEstado(estado: EstadoPedido) {
    setError('');
    startTransition(async () => {
      const r = await accionCambiarEstadoPedido(pedido.id, estado);
      if (!r.ok) {
        setError(r.error ?? 'Error al cambiar el estado');
        return;
      }
      router.refresh();
    });
  }
  function avanzarEtapa(itemId: string, etapa: EtapaConfeccion) {
    setError('');
    startTransition(async () => {
      const r = await accionActualizarEtapaConfeccion(itemId, etapa);
      if (!r.ok) {
        setError(r.error ?? 'Error al actualizar la etapa');
        return;
      }
      router.refresh();
    });
  }
  function anular() {
    if (!confirm(`¿Anular el pedido ${pedido.codigo}? Esto libera los activos reservados y revierte lo ya cobrado.`)) return;
    setError('');
    startTransition(async () => {
      const r = await accionAnularPedido(pedido.id, 'Anulado desde el detalle del pedido');
      if (!r.ok) {
        setError(r.error ?? 'Error al anular el pedido');
        return;
      }
      router.refresh();
    });
  }

  const puedeCerrar = pedido.estado !== 'cerrado' && pedido.estado !== 'cancelado';
  const lineasConfeccion = pedido.items.filter((i) => i.tipo === 'confeccion' && i.estado === 'activo');
  const hayAlquilerActivo = pedido.items.some((i) => i.tipo === 'alquiler' && i.estado === 'activo');

  return (
    <div className="mt-4 space-y-3">
      {lineasConfeccion.map((linea) => (
        <div key={linea.id}>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">
            Etapa de confección — <span className="tabular-nums">{linea.descripcion || linea.activoCodigo || linea.id.slice(0, 8)}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS_CONFECCION.map((e) => (
              <button
                key={e}
                type="button"
                disabled={pending}
                onClick={() => avanzarEtapa(linea.id, e)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  linea.etapaConfeccion === e ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
                  pending && 'opacity-60',
                )}
              >
                {ETAPA_LABEL[e]}
              </button>
            ))}
          </div>
        </div>
      ))}

      {puedeCerrar && (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Estado del pedido</p>
          <div className="flex flex-wrap gap-2">
            {pedido.estado === 'abierto' && (
              <Button type="button" variant="outline" pending={pending} onClick={() => cambiarEstado('entregado')}>
                Marcar entregado
              </Button>
            )}
            {hayAlquilerActivo && (
              <Button type="button" variant="outline" pending={pending} onClick={() => cambiarEstado('devuelto')}>
                Marcar devuelto
              </Button>
            )}
            {pedido.estado !== 'abierto' && (
              <Button type="button" variant="ghost" pending={pending} onClick={() => cambiarEstado('cerrado')}>
                Cerrar pedido
              </Button>
            )}
            <button type="button" disabled={pending} onClick={anular} className={cn(buttonVariants({ variant: 'ghost' }), 'text-error-deep hover:bg-error-soft')}>
              Anular pedido
            </button>
          </div>
          {!hayAlquilerActivo && pedido.items.some((i) => i.tipo === 'alquiler') && (
            <p className="mt-1.5 text-[11px] text-muted">El/los activo(s) ya reingresaron al pipeline de lavandería para procesarse.</p>
          )}
        </div>
      )}
      {error && <Aviso tono="error" className="text-sm">{error}</Aviso>}
    </div>
  );
}
