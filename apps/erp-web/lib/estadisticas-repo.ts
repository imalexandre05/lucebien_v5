import { getServerClient } from './supabase/server';
import { mapaNombres } from './directorio';

// Panel gerencial /estadisticas (S20). Consume los RPCs de agregación (0040); la RLS por
// sede aplica sola (security invoker). El core (@scilb/core) arma series/porcentajes.

export type IngresoDia = { fecha: string; ingresos: number; egresos: number };
export type CategoriaMonto = { tipo: string; categoria: string; total: number };
export type PedidoAgg = { tipo: string; estado: string; n: number; total: number };
export type ProductividadItem = { empleadoId: string; nombre: string; puntos: number; acciones: number };
export type IncidenciaAgg = { sedeCod: string; nivel: string; n: number; penalidad: number };
export type Fr01Agg = { sedeCod: string; reportes: number; actTotal: number; actDone: number; puntajeProm: number | null };
export type CompraDia = { fecha: string; estado: string; n: number; total: number };
export type InventarioAgg = { estado: string; n: number; valor: number };

export type Estadisticas = {
  ingresos: IngresoDia[];
  ingresosCategoria: CategoriaMonto[];
  pedidos: PedidoAgg[];
  productividad: ProductividadItem[];
  incidencias: IncidenciaAgg[];
  fr01: Fr01Agg[];
  compras: CompraDia[];
  inventario: InventarioAgg[];
};

export async function cargarEstadisticas(desde: string, hasta: string): Promise<Estadisticas> {
  const sb = getServerClient();
  const args = { p_desde: desde, p_hasta: hasta };
  const [ingresos, ingresosCategoria, pedidos, productividad, incidencias, fr01, compras, inventario] = await Promise.all([
    sb.rpc('est_ingresos', args),
    sb.rpc('est_ingresos_categoria', args),
    sb.rpc('est_pedidos', args),
    sb.rpc('est_productividad', args),
    sb.rpc('est_incidencias', args),
    sb.rpc('est_fr01', args),
    sb.rpc('est_compras', args),
    sb.rpc('est_inventario'),
  ]);
  for (const r of [ingresos, ingresosCategoria, pedidos, productividad, incidencias, fr01, compras, inventario]) {
    if (r.error) throw new Error(r.error.message);
  }

  const nombre = await mapaNombres();
  const num = (v: unknown) => Number(v ?? 0);

  return {
    ingresos: ((ingresos.data as Record<string, unknown>[]) ?? []).map((r) => ({
      fecha: String(r.fecha).slice(0, 10),
      ingresos: num(r.ingresos),
      egresos: num(r.egresos),
    })),
    ingresosCategoria: ((ingresosCategoria.data as Record<string, unknown>[]) ?? []).map((r) => ({
      tipo: String(r.tipo),
      categoria: String(r.categoria),
      total: num(r.total),
    })),
    pedidos: ((pedidos.data as Record<string, unknown>[]) ?? []).map((r) => ({
      tipo: String(r.tipo),
      estado: String(r.estado),
      n: num(r.n),
      total: num(r.total),
    })),
    productividad: ((productividad.data as Record<string, unknown>[]) ?? []).map((r) => ({
      empleadoId: String(r.empleado_id),
      nombre: nombre.get(String(r.empleado_id)) ?? '—',
      puntos: num(r.puntos),
      acciones: num(r.acciones),
    })),
    incidencias: ((incidencias.data as Record<string, unknown>[]) ?? []).map((r) => ({
      sedeCod: String(r.sede_cod),
      nivel: String(r.nivel),
      n: num(r.n),
      penalidad: num(r.penalidad),
    })),
    fr01: ((fr01.data as Record<string, unknown>[]) ?? []).map((r) => ({
      sedeCod: String(r.sede_cod),
      reportes: num(r.reportes),
      actTotal: num(r.act_total),
      actDone: num(r.act_done),
      puntajeProm: r.puntaje_prom == null ? null : num(r.puntaje_prom),
    })),
    compras: ((compras.data as Record<string, unknown>[]) ?? []).map((r) => ({
      fecha: String(r.fecha).slice(0, 10),
      estado: String(r.estado),
      n: num(r.n),
      total: num(r.total),
    })),
    inventario: ((inventario.data as Record<string, unknown>[]) ?? []).map((r) => ({
      estado: String(r.estado),
      n: num(r.n),
      valor: num(r.valor),
    })),
  };
}
