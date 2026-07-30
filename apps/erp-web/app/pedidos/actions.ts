'use server';

import { revalidatePath } from 'next/cache';
import { pedidoCrearSchema, type PedidoCrearInput, type Pedido, type EstadoPedido, type EtapaConfeccion } from '@scilb/core';
import { pedidosRepo, PedidoRpcError } from '../../lib/pedidos-repo';

type R = { ok: boolean; error?: string };

// Constructor multi-línea (Fase 9) — reemplaza el modal de un solo ítem (`app/pedidos/cliente.tsx`,
// borrado en esta fase: el plan pide "una sola página /pedidos, sin modal, sin rutas nuevas para
// el flujo principal"). Recibe el payload YA armado por `PedidosConstructor` (cliente + N líneas +
// garantía + cobro inicial) y lo manda TAL CUAL a `pedidosRepo.crear()` → `pedido_crear` (una sola
// transacción, Fase 8) — nada de adaptar un formulario plano viejo aquí.
// `codigo` (SIN_CAJA/ACTIVO_OCUPADO/ACTIVO_EN_LAVANDERIA/COBRO_EXCEDE/...) viaja aparte del mensaje
// para que el ticket pueda reaccionar (ej. abrir el banner "Abrir caja" inline) sin parsear texto.
export async function accionCrearPedidoConstructor(
  input: PedidoCrearInput,
): Promise<{ ok: true; pedido: Pedido } | { ok: false; error: string; codigo?: string }> {
  const parsed = pedidoCrearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos obligatorios' };
  }
  try {
    const pedido = await pedidosRepo.crear(parsed.data);
    revalidatePath('/pedidos');
    revalidatePath('/pipeline');
    revalidatePath('/');
    revalidatePath('/finanzas');
    return { ok: true, pedido };
  } catch (e) {
    if (e instanceof PedidoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
    return { ok: false, error: e instanceof Error ? e.message : 'Error al crear el pedido' };
  }
}

// Cobro del saldo desde el panel de Pendientes (⑥) o el detalle del pedido — única verdad del
// cobro (pedido_cobrar, 0061), la misma RPC que usará /caja desde la Fase 10.
export async function accionCobrarSaldoPedido(pedidoId: string, monto: number, metodo: string): Promise<R & { codigo?: string }> {
  try {
    await pedidosRepo.cobrar({ pedidoId, monto, metodo });
    revalidatePath('/pedidos');
    revalidatePath(`/pedidos/${pedidoId}`);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    if (e instanceof PedidoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cobrar el saldo' };
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

export async function accionActualizarEtapaConfeccion(itemId: string, etapa: EtapaConfeccion): Promise<R> {
  try {
    await pedidosRepo.actualizarEtapaConfeccion(itemId, etapa);
    revalidatePath('/pedidos');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al actualizar la etapa' };
  }
}

// Anular (Fase 8): libera activos + revierte lo cobrado vía contra-asiento — antes no existía
// como acción propia, el estado 'cancelado' no era alcanzable desde la UI.
export async function accionAnularPedido(id: string, motivo?: string): Promise<R> {
  try {
    await pedidosRepo.anular(id, motivo);
    revalidatePath(`/pedidos/${id}`);
    revalidatePath('/pedidos');
    revalidatePath('/pedidos/devoluciones');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al anular el pedido' };
  }
}
