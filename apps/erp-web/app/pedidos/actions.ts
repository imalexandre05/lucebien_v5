'use server';

import { revalidatePath } from 'next/cache';
import { pedidoSchema, type PedidoInput, type EstadoPedido, type EtapaConfeccion } from '@scilb/core';
import { pedidosRepo } from '../../lib/pedidos-repo';

type R = { ok: boolean; error?: string };

// El modal envía un objeto tipado (no FormData) — mismo patrón que accionCrearActivo (Fase 8).
export async function accionCrearPedido(input: PedidoInput): Promise<R> {
  const parsed = pedidoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos obligatorios' };
  }
  try {
    await pedidosRepo.crear(parsed.data);
    revalidatePath('/pedidos');
    revalidatePath('/pipeline');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el pedido' };
  }
}

export async function accionCambiarEstadoPedido(id: string, estado: EstadoPedido): Promise<R> {
  try {
    await pedidosRepo.cambiarEstado(id, estado);
    revalidatePath(`/pedidos/${id}`);
    revalidatePath('/pedidos');
    revalidatePath('/pipeline');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cambiar el estado' };
  }
}

export async function accionActualizarEtapaConfeccion(id: string, etapa: EtapaConfeccion): Promise<R> {
  try {
    await pedidosRepo.actualizarEtapaConfeccion(id, etapa);
    revalidatePath(`/pedidos/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al actualizar la etapa' };
  }
}
