'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ETAPAS_CONFECCION, type Pedido, type EstadoPedido, type EtapaConfeccion } from '@scilb/core';
import { accionCambiarEstadoPedido, accionActualizarEtapaConfeccion } from '../actions';
import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';

const ETAPA_LABEL: Record<EtapaConfeccion, string> = { corte: 'Corte', armado: 'Armado', ajuste: 'Ajuste', entrega: 'Entrega' };

// Transiciones de estado a botones directos (sin modal — es una sola acción, no un formulario) y,
// si es confección, el avance por sus etapas propias (E4: corte→armado→ajuste→entrega).
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
  function avanzarEtapa(etapa: EtapaConfeccion) {
    setError('');
    startTransition(async () => {
      const r = await accionActualizarEtapaConfeccion(pedido.id, etapa);
      if (!r.ok) {
        setError(r.error ?? 'Error al actualizar la etapa');
        return;
      }
      router.refresh();
    });
  }

  const puedeCerrar = pedido.estado !== 'cerrado' && pedido.estado !== 'cancelado';

  return (
    <div className="mt-4 space-y-3">
      {pedido.tipo === 'confeccion' && (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Etapa de confección</p>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS_CONFECCION.map((e) => (
              <button
                key={e}
                type="button"
                disabled={pending}
                onClick={() => avanzarEtapa(e)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  pedido.etapaConfeccion === e ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-gold',
                  pending && 'opacity-60',
                )}
              >
                {ETAPA_LABEL[e]}
              </button>
            ))}
          </div>
        </div>
      )}

      {puedeCerrar && (
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Estado del pedido</p>
          <div className="flex flex-wrap gap-2">
            {pedido.estado === 'abierto' && (
              <button type="button" disabled={pending} onClick={() => cambiarEstado('entregado')} className={cn(buttonVariants({ variant: 'outline' }), pending && 'opacity-60')}>
                Marcar entregado
              </button>
            )}
            {pedido.tipo === 'alquiler' && pedido.estado === 'entregado' && (
              <button type="button" disabled={pending} onClick={() => cambiarEstado('devuelto')} className={cn(buttonVariants({ variant: 'outline' }), pending && 'opacity-60')}>
                Marcar devuelto
              </button>
            )}
            {pedido.estado !== 'abierto' && (
              <button type="button" disabled={pending} onClick={() => cambiarEstado('cerrado')} className={cn(buttonVariants({ variant: 'ghost' }), pending && 'opacity-60')}>
                Cerrar pedido
              </button>
            )}
          </div>
          {pedido.tipo === 'alquiler' && pedido.estado === 'devuelto' && (
            <p className="mt-1.5 text-[11px] text-muted">El/los activo(s) ya reingresaron al pipeline de lavandería para procesarse.</p>
          )}
        </div>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
