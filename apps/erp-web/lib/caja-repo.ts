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

// Registrar un COBRO: ligado a un pedido; exige caja abierta en la sede del pedido.
export async function registrarCobro(p: {
  pedidoId: string;
  monto: number;
  metodo: string;
  cobroTipo: 'adelanto' | 'saldo' | 'completo';
  descripcion?: string;
}): Promise<void> {
  const sb = getServerClient();
  const { data: ped, error: e1 } = await sb.from('pedidos').select('sede_cod').eq('id', p.pedidoId).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!ped) throw new Error('Pedido no encontrado');
  const sede = (ped as { sede_cod: string }).sede_cod;
  const ses = await sesionAbierta(sede);
  if (!ses) throw new Error(`Abre la caja de ${sede} antes de registrar cobros.`);
  const { error } = await sb.from('caja_movimientos').insert({
    sesion_id: ses.id,
    sede_cod: sede,
    tipo: 'ingreso',
    categoria: 'cobro',
    monto: p.monto,
    metodo: p.metodo,
    pedido_id: p.pedidoId,
    cobro_tipo: p.cobroTipo,
    descripcion: p.descripcion ?? null,
    registrado_por_id: await usuarioId(),
  });
  if (error) throw new Error(error.message);
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

// Cobros pendientes: pedidos con saldo (total − cobrado) > 0.
export async function cobrosPendientes(): Promise<CobroPendiente[]> {
  const sb = getServerClient();
  const [{ data: peds, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
    sb.from('pedidos').select('id, tipo, fecha, total, clientes(nombre)').order('fecha', { ascending: false }),
    sb.from('caja_movimientos').select('pedido_id, monto').eq('categoria', 'cobro'),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const cobradoPor = new Map<string, number>();
  for (const m of (movs as { pedido_id: string | null; monto: number }[]) ?? []) {
    if (!m.pedido_id) continue;
    cobradoPor.set(m.pedido_id, (cobradoPor.get(m.pedido_id) ?? 0) + Number(m.monto));
  }
  const out: CobroPendiente[] = [];
  for (const p of (peds as Record<string, unknown>[]) ?? []) {
    const total = Number(p.total ?? 0);
    const cobrado = cobradoPor.get(String(p.id)) ?? 0;
    const saldo = Math.round((total - cobrado) * 100) / 100;
    if (saldo > 0) {
      out.push({
        pedidoId: String(p.id),
        clienteNombre: (p.clientes as { nombre: string } | null)?.nombre ?? null,
        tipo: String(p.tipo),
        fecha: String(p.fecha).slice(0, 10),
        total,
        cobrado,
        saldo,
      });
    }
  }
  return out;
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

// Arqueo/resumen de una sesión: ingresos/egresos totales y por método + efectivo esperado.
export function resumenMovimientos(sesion: CajaSesion, movs: CajaMovimiento[]) {
  const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresos = movs.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const efIn = movs.filter((m) => m.tipo === 'ingreso' && m.metodo === 'efectivo').reduce((s, m) => s + m.monto, 0);
  const efOut = movs.filter((m) => m.tipo === 'egreso' && m.metodo === 'efectivo').reduce((s, m) => s + m.monto, 0);
  const porMetodo = (metodo: string) =>
    movs.filter((m) => m.tipo === 'ingreso' && m.metodo === metodo).reduce((s, m) => s + m.monto, 0);
  return {
    ingresos: Math.round(ingresos * 100) / 100,
    egresos: Math.round(egresos * 100) / 100,
    neto: Math.round((ingresos - egresos) * 100) / 100,
    efectivoEsperado: Math.round((sesion.montoApertura + efIn - efOut) * 100) / 100,
    efectivo: porMetodo('efectivo'),
    yape: porMetodo('yape'),
    transferencia: porMetodo('transferencia'),
  };
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
