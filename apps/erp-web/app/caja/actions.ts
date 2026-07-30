'use server';

import { revalidatePath } from 'next/cache';
import { puede, type MatrizPermisos } from '@scilb/core';
import { abrirCaja, cerrarCaja, registrarEgreso, registrarGarantia } from '../../lib/caja-repo';
import { pedidosRepo, PedidoRpcError } from '../../lib/pedidos-repo';
import { getSesion } from '../../lib/auth';
import { leerMatrizPermisos } from '../../lib/permisos-repo';

// Cajero como permiso configurable (Fase 9): 'pos_cobro'. Se valida aquí (no solo ocultando
// botones en el cliente) porque estas acciones mueven dinero — mismo criterio que Fase 7
// (incidencias) de no dejar la restricción solo en la UI.
async function exigirCajero(): Promise<string | null> {
  const sesion = await getSesion();
  if (!sesion) return 'Sesión requerida';
  let matriz: MatrizPermisos = {};
  try {
    matriz = await leerMatrizPermisos();
  } catch {
    matriz = {};
  }
  if (!puede(matriz, sesion.usuario.rol, 'pos_cobro', 'ver', sesion.usuario.rolCod)) return 'No tienes el permiso de cajero';
  return null;
}

export async function accionAbrirCaja(sede: string, montoApertura: number): Promise<{ ok: boolean; error?: string }> {
  const bloqueo = await exigirCajero();
  if (bloqueo) return { ok: false, error: bloqueo };
  try {
    await abrirCaja(sede, montoApertura);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al abrir caja' };
  }
}

export async function accionCerrarCaja(sesionId: string, montoCierre: number): Promise<{ ok: boolean; error?: string }> {
  const bloqueo = await exigirCajero();
  if (bloqueo) return { ok: false, error: bloqueo };
  try {
    await cerrarCaja(sesionId, montoCierre);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cerrar caja' };
  }
}

// Cobros unificados (Fase 10, punto 2): /caja deja de insertar el `caja_movimientos` a mano
// (`registrarCobro()` en lib/caja-repo.ts, que ya no se usa acá) y llama a la MISMA RPC
// `pedido_cobrar` que usa el ticket de /pedidos (ver accionCobrarSaldoPedido en
// app/pedidos/actions.ts) — un cobro desde cualquiera de las dos pantallas produce exactamente el
// mismo asiento y deja el mismo `saldo` (columna generada, Fase 8). Ya no se pide "tipo de cobro"
// a mano: pedido_cobrar lo deriva sola de cuánto queda por cobrar.
export async function accionRegistrarCobro(p: {
  pedidoId: string;
  monto: number;
  metodo: string;
  descripcion?: string;
}): Promise<{ ok: boolean; error?: string; codigo?: string }> {
  const bloqueo = await exigirCajero();
  if (bloqueo) return { ok: false, error: bloqueo };
  try {
    await pedidosRepo.cobrar({ pedidoId: p.pedidoId, monto: p.monto, metodo: p.metodo, descripcion: p.descripcion });
    revalidatePath('/caja');
    revalidatePath('/pedidos');
    revalidatePath(`/pedidos/${p.pedidoId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof PedidoRpcError) return { ok: false, error: e.message, codigo: e.codigo };
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar cobro' };
  }
}

export async function accionRegistrarEgreso(p: {
  sede: string;
  monto: number;
  metodo: string;
  categoria: 'gasto' | 'devolucion_garantia' | 'otro';
  descripcion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const bloqueo = await exigirCajero();
  if (bloqueo) return { ok: false, error: bloqueo };
  try {
    await registrarEgreso(p);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar egreso' };
  }
}

export async function accionRegistrarGarantia(p: {
  sede: string;
  monto: number;
  metodo: string;
  descripcion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const bloqueo = await exigirCajero();
  if (bloqueo) return { ok: false, error: bloqueo };
  try {
    await registrarGarantia(p);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar garantía' };
  }
}
