'use server';

import { revalidatePath } from 'next/cache';
import { abrirCaja, cerrarCaja, registrarCobro, registrarEgreso } from '../../lib/caja-repo';

export async function accionAbrirCaja(sede: string, montoApertura: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await abrirCaja(sede, montoApertura);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al abrir caja' };
  }
}

export async function accionCerrarCaja(sesionId: string, montoCierre: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await cerrarCaja(sesionId, montoCierre);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al cerrar caja' };
  }
}

export async function accionRegistrarCobro(p: {
  pedidoId: string;
  monto: number;
  metodo: string;
  cobroTipo: 'adelanto' | 'saldo' | 'completo';
  descripcion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await registrarCobro(p);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
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
  try {
    await registrarEgreso(p);
    revalidatePath('/caja');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al registrar egreso' };
  }
}
