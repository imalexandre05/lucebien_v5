import { resumenCaja } from '@scilb/core';
import { getServerClient } from './supabase/server';
import { getSesion } from './auth';
import { mapaNombres } from './directorio';

// Cajas y Cobros (S13). Cobros ligados a pedido; caja diaria con apertura/cierre; egresos.
export type CajaSesion = {
  id: string;
  sedeCod: string;
  fecha: string;
  estado: 'abierta' | 'cerrada';
  montoApertura: number;
  montoCierre: number | null;
  aperturaAt: string;
  cierreAt: string | null;
  obs: string | null;
};

export type CajaMovimiento = {
  id: string;
  sesionId: string | null;
  sedeCod: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  categoria: string;
  monto: number;
  metodo: string | null;
  pedidoId: string | null;
  cobroTipo: string | null;
  descripcion: string | null;
  registradoPorId: string | null;
  registradoPorNombre: string | null;
  createdAt: string;
};

export type CobroPendiente = {
  pedidoId: string;
  clienteNombre: string | null;
  tipo: string;
  fecha: string;
  total: number;
  cobrado: number;
  saldo: number;
};

const SES = 'id, sede_cod, fecha, estado, monto_apertura, monto_cierre, apertura_at, cierre_at, obs';

function sesFromRow(r: Record<string, unknown>): CajaSesion {
  return {
    id: String(r.id),
    sedeCod: String(r.sede_cod),
    fecha: String(r.fecha).slice(0, 10),
    estado: r.estado === 'cerrada' ? 'cerrada' : 'abierta',
    montoApertura: Number(r.monto_apertura ?? 0),
    montoCierre: r.monto_cierre == null ? null : Number(r.monto_cierre),
    aperturaAt: String(r.apertura_at ?? ''),
    cierreAt: (r.cierre_at as string | null) ?? null,
    obs: (r.obs as string | null) ?? null,
  };
}

async function usuarioId(): Promise<string | null> {
  const s = await getSesion();
  return s?.usuario.id ?? null;
}

export async function sesionAbierta(sede: string): Promise<CajaSesion | null> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('caja_sesiones')
    .select(SES)
    .eq('sede_cod', sede)
    .eq('estado', 'abierta')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? sesFromRow(data as Record<string, unknown>) : null;
}

export async function abrirCaja(sede: string, montoApertura: number): Promise<CajaSesion> {
  if (await sesionAbierta(sede)) throw new Error(`La caja de ${sede} ya está abierta.`);
  const sb = getServerClient();
  const { data, error } = await sb
    .from('caja_sesiones')
    .insert({ sede_cod: sede, monto_apertura: montoApertura, abierta_por_id: await usuarioId(), estado: 'abierta' })
    .select(SES)
    .single();
  if (error) throw new Error(error.message);
  return sesFromRow(data as Record<string, unknown>);
}

export async function cerrarCaja(sesionId: string, montoCierre: number): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('caja_sesiones')
    .update({ estado: 'cerrada', monto_cierre: montoCierre, cerrada_por_id: await usuarioId(), cierre_at: new Date().toISOString() })
    .eq('id', sesionId)
    .eq('estado', 'abierta');
  if (error) throw new Error(error.message);
}

export async function movimientosSesion(sesionId: string): Promise<CajaMovimiento[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('caja_movimientos')
    .select('*')
    .eq('sesion_id', sesionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];
  const nombre = await mapaNombres();
  return rows.map((r) => ({
    id: String(r.id),
    sesionId: (r.sesion_id as string | null) ?? null,
    sedeCod: String(r.sede_cod),
    fecha: String(r.fecha).slice(0, 10),
    tipo: r.tipo === 'egreso' ? 'egreso' : 'ingreso',
    categoria: String(r.categoria),
    monto: Number(r.monto ?? 0),
    metodo: (r.metodo as string | null) ?? null,
    pedidoId: (r.pedido_id as string | null) ?? null,
    cobroTipo: (r.cobro_tipo as string | null) ?? null,
    descripcion: (r.descripcion as string | null) ?? null,
    registradoPorId: (r.registrado_por_id as string | null) ?? null,
    registradoPorNombre: r.registrado_por_id ? nombre.get(String(r.registrado_por_id)) ?? null : null,
    createdAt: String(r.created_at ?? ''),
  }));
}

// Registrar un EGRESO/gasto (o devolución de garantía): exige caja abierta en la sede.
export async function registrarEgreso(p: {
  sede: string;
  monto: number;
  metodo: string;
  categoria: 'gasto' | 'devolucion_garantia' | 'otro';
  descripcion?: string;
}): Promise<void> {
  const sb = getServerClient();
  const ses = await sesionAbierta(p.sede);
  if (!ses) throw new Error(`Abre la caja de ${p.sede} antes de registrar egresos.`);
  const { error } = await sb.from('caja_movimientos').insert({
    sesion_id: ses.id,
    sede_cod: p.sede,
    tipo: 'egreso',
    categoria: p.categoria,
    monto: p.monto,
    metodo: p.metodo,
    descripcion: p.descripcion ?? null,
    registrado_por_id: await usuarioId(),
  });
  if (error) throw new Error(error.message);
}

// Registrar una GARANTÍA (depósito reembolsable del alquiler): ingreso; exige caja abierta.
export async function registrarGarantia(p: {
  sede: string;
  monto: number;
  metodo: string;
  descripcion?: string;
}): Promise<void> {
  const sb = getServerClient();
  const ses = await sesionAbierta(p.sede);
  if (!ses) throw new Error(`Abre la caja de ${p.sede} antes de registrar garantías.`);
  const { error } = await sb.from('caja_movimientos').insert({
    sesion_id: ses.id,
    sede_cod: p.sede,
    tipo: 'ingreso',
    categoria: 'garantia',
    monto: p.monto,
    metodo: p.metodo,
    descripcion: p.descripcion ?? null,
    registrado_por_id: await usuarioId(),
  });
  if (error) throw new Error(error.message);
}

// Cobros pendientes: pedidos con saldo > 0. Fase 8: `saldo` (= total − cobrado) es ahora una
// columna GENERADA de `pedidos` (migración 0059), mantenida por trigger ante cualquier movimiento
// de caja categoría 'cobro' — antes esto traía TODOS los pedidos y TODOS los movimientos para
// unirlos a mano en Node; ahora es un solo `where saldo > 0` directo sobre la base.
export async function cobrosPendientes(): Promise<CobroPendiente[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('pedidos')
    .select('id, tipo, fecha, total, cobrado, saldo, clientes(nombre)')
    .gt('saldo', 0)
    .order('fecha', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((p) => ({
    pedidoId: String(p.id),
    clienteNombre: (p.clientes as { nombre: string } | null)?.nombre ?? null,
    tipo: String(p.tipo),
    fecha: String(p.fecha).slice(0, 10),
    total: Number(p.total),
    cobrado: Number(p.cobrado),
    saldo: Number(p.saldo),
  }));
}

// Total de garantías vigentes: ingresos por garantía − devoluciones de garantía.
export async function totalGarantias(): Promise<number> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('caja_movimientos')
    .select('categoria, monto')
    .in('categoria', ['garantia', 'devolucion_garantia']);
  if (error) throw new Error(error.message);
  let t = 0;
  for (const m of (data as { categoria: string; monto: number }[]) ?? []) {
    t += m.categoria === 'garantia' ? Number(m.monto) : -Number(m.monto);
  }
  return Math.round(t * 100) / 100;
}

// Arqueo/resumen de una sesión — delega en el cálculo puro de @scilb/core (testeado).
export function resumenMovimientos(sesion: CajaSesion, movs: CajaMovimiento[]) {
  return resumenCaja(
    sesion.montoApertura,
    movs.map((m) => ({ tipo: m.tipo, monto: m.monto, metodo: m.metodo })),
  );
}

// Historial de cajas (sesiones + arqueo): apertura, ingresos/egresos, esperado y diferencia.
export type SesionResumen = {
  id: string;
  sedeCod: string;
  fecha: string;
  estado: 'abierta' | 'cerrada';
  montoApertura: number;
  montoCierre: number | null;
  ingresos: number;
  egresos: number;
  efectivoEsperado: number;
  diferencia: number | null;
};

export async function historialCaja(limit = 50): Promise<SesionResumen[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('caja_sesiones')
    .select(SES)
    .order('fecha', { ascending: false })
    .order('apertura_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const sesiones = ((data as Record<string, unknown>[]) ?? []).map(sesFromRow);
  if (!sesiones.length) return [];

  const { data: movData, error: e2 } = await sb
    .from('caja_movimientos')
    .select('sesion_id, tipo, monto, metodo')
    .in('sesion_id', sesiones.map((s) => s.id));
  if (e2) throw new Error(e2.message);

  const agg = new Map<string, { ingresos: number; egresos: number; efIn: number; efOut: number }>();
  for (const m of (movData as { sesion_id: string | null; tipo: string; monto: number; metodo: string | null }[]) ?? []) {
    if (!m.sesion_id) continue;
    const cur = agg.get(m.sesion_id) ?? { ingresos: 0, egresos: 0, efIn: 0, efOut: 0 };
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') {
      cur.ingresos += monto;
      if (m.metodo === 'efectivo') cur.efIn += monto;
    } else {
      cur.egresos += monto;
      if (m.metodo === 'efectivo') cur.efOut += monto;
    }
    agg.set(m.sesion_id, cur);
  }

  return sesiones.map((s) => {
    const t = agg.get(s.id) ?? { ingresos: 0, egresos: 0, efIn: 0, efOut: 0 };
    const esperado = Math.round((s.montoApertura + t.efIn - t.efOut) * 100) / 100;
    return {
      id: s.id,
      sedeCod: s.sedeCod,
      fecha: s.fecha,
      estado: s.estado,
      montoApertura: s.montoApertura,
      montoCierre: s.montoCierre,
      ingresos: Math.round(t.ingresos * 100) / 100,
      egresos: Math.round(t.egresos * 100) / 100,
      efectivoEsperado: esperado,
      diferencia: s.montoCierre == null ? null : Math.round((s.montoCierre - esperado) * 100) / 100,
    };
  });
}

// Resumen financiero (S14): ingresos/egresos de caja por método y categoría en un periodo.
export type ResumenFinanciero = {
  ingresos: number;
  egresos: number;
  neto: number;
  efectivo: number;
  yape: number;
  transferencia: number;
  ingresosCat: Record<string, number>;
  egresosCat: Record<string, number>;
};

export async function resumenFinanciero(desde?: string, hasta?: string): Promise<ResumenFinanciero> {
  const sb = getServerClient();
  let q = sb.from('caja_movimientos').select('tipo, categoria, monto, metodo');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let ingresos = 0;
  let egresos = 0;
  let efectivo = 0;
  let yape = 0;
  let transferencia = 0;
  const ingresosCat: Record<string, number> = {};
  const egresosCat: Record<string, number> = {};
  for (const m of (data as { tipo: string; categoria: string; monto: number; metodo: string | null }[]) ?? []) {
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') {
      ingresos += monto;
      ingresosCat[m.categoria] = (ingresosCat[m.categoria] ?? 0) + monto;
      if (m.metodo === 'efectivo') efectivo += monto;
      else if (m.metodo === 'yape') yape += monto;
      else if (m.metodo === 'transferencia') transferencia += monto;
    } else {
      egresos += monto;
      egresosCat[m.categoria] = (egresosCat[m.categoria] ?? 0) + monto;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ingresos: r2(ingresos),
    egresos: r2(egresos),
    neto: r2(ingresos - egresos),
    efectivo: r2(efectivo),
    yape: r2(yape),
    transferencia: r2(transferencia),
    ingresosCat,
    egresosCat,
  };
}
