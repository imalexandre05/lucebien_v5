'use server';

import { revalidatePath } from 'next/cache';
import { pedidoSchema, type PedidoInput, type PedidoCrearInput, type EstadoPedido, type EtapaConfeccion } from '@scilb/core';
import { pedidosRepo } from '../../lib/pedidos-repo';
import { getServerClient } from '../../lib/supabase/server';

type R = { ok: boolean; error?: string };

// El modal (app/pedidos/cliente.tsx) sigue siendo el de un solo ítem por ahora — el constructor
// multi-línea real es la Fase 9, fuera de alcance aquí ("ajusta el modal actual lo mínimo para
// que siga funcionando con el modelo nuevo"). Este adapter arma el payload real de pedido_crear
// (cliente + 1 línea + garantía derivada de garantiaMonto) a partir de ese formulario plano, así
// el repo/RPC nuevos no necesitan saber nada del formulario viejo.
function aPedidoCrearInput(input: PedidoInput): PedidoCrearInput {
  return {
    cliente: { id: input.clienteId, nombre: '' /* ya existe: pedido_crear exige nombre incluso al editar, ver nota abajo */ },
    sedeCod: input.sedeCod,
    items: [
      {
        tipo: input.tipo,
        activoId: input.activoId || undefined,
        descripcion: input.descripcion,
        cantidad: 1,
        precioUnitario: input.total,
        tela: input.tipo === 'confeccion' ? input.tela : undefined,
        fechaPrueba: input.tipo === 'confeccion' ? input.fechaPrueba : undefined,
        fechaSegundaPrueba: input.tipo === 'confeccion' ? input.fechaSegundaPrueba : undefined,
        etapaConfeccion: input.tipo === 'confeccion' ? 'corte' : undefined,
      },
    ],
    garantia:
      input.tipo === 'alquiler' && input.garantiaMonto > 0
        ? { tipo: 'efectivo', monto: input.garantiaMonto, metodo: 'efectivo' }
        : { tipo: 'ninguna' },
    pagos: [], // el modal viejo no cobra al crear — el cobro se sigue registrando aparte en /caja
    fecha: input.fecha,
    fechaDevolucion: input.fechaDevolucion || undefined,
    fechaEntrega: input.fechaEntrega || undefined,
    notas: input.notas,
  };
}

// El modal envía un objeto tipado (no FormData) — mismo patrón que accionCrearActivo (Fase 8).
export async function accionCrearPedido(input: PedidoInput): Promise<R> {
  const parsed = pedidoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos obligatorios' };
  }
  try {
    // pedido_crear (0061) exige `cliente.nombre` incluso cuando se manda un `id` existente (es
    // el mismo contrato de "editar todo" que pide el plan) — el modal viejo solo tiene el id del
    // cliente elegido en el <select>, así que se resuelve el nombre server-side antes de llamar
    // al repo para no tener que tocar el formulario del cliente por esto. Fetch mínimo (no la
    // lista completa) — el <select> del modal ya la trajo aparte para pintarse.
    const sb = getServerClient();
    const { data: cliente, error: eCliente } = await sb
      .from('clientes')
      .select('nombre, dni, telefono')
      .eq('id', parsed.data.clienteId)
      .maybeSingle();
    if (eCliente) return { ok: false, error: eCliente.message };
    if (!cliente) return { ok: false, error: 'Cliente no encontrado' };

    const crearInput = aPedidoCrearInput(parsed.data);
    crearInput.cliente.nombre = (cliente as { nombre: string }).nombre;
    crearInput.cliente.dni = (cliente as { dni: string | null }).dni ?? undefined;
    crearInput.cliente.telefono = (cliente as { telefono: string | null }).telefono ?? undefined;

    await pedidosRepo.crear(crearInput);
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
