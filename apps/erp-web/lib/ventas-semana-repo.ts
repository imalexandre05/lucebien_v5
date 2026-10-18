import { getServerClient } from './supabase/server';

// Ventas y metas cargadas a mano por semana (migración 0166, decisión del dueño n.º 8). Es un
// puente temporal hasta conectar el sistema de punto de venta.
//
// `getServerClient()`, nunca el cliente admin: la RLS de la tabla ya deja escribir sólo al
// administrador y leer a cada persona lo suyo. Un trigger de la base corta si la semana cae en un
// pago cerrado; acá sólo se traduce ese corte a una frase que se pueda leer.

export type VentaSemana = {
  empleadoId: string;
  desde: string;
  hasta: string;
  totalBoletasMayores: number;
  /** null = lo decide el monto vendido. */
  metaCumplida: boolean | null;
  montoVendido: number | null;
};

type Fila = {
  empleado_id: string;
  desde: string;
  hasta: string;
  total_boletas_mayores: number | string;
  meta_cumplida: boolean | null;
  monto_vendido: number | string | null;
};

const MSG_CERRADO = 'Esa semana ya está en un pago cerrado: no se puede cambiar.';

function aVentaSemana(r: Fila): VentaSemana {
  return {
    empleadoId: r.empleado_id,
    desde: String(r.desde).slice(0, 10),
    hasta: String(r.hasta).slice(0, 10),
    totalBoletasMayores: Number(r.total_boletas_mayores ?? 0),
    metaCumplida: r.meta_cumplida ?? null,
    montoVendido: r.monto_vendido == null ? null : Number(r.monto_vendido),
  };
}

/** Las semanas cargadas que EMPIEZAN dentro del rango (así las une el motor con el período). */
export async function listarVentasSemana(empleadoId: string, desde: string, hasta: string): Promise<VentaSemana[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('sueldo_ventas_semana')
    .select('empleado_id, desde, hasta, total_boletas_mayores, meta_cumplida, monto_vendido')
    .eq('empleado_id', empleadoId)
    .gte('desde', desde)
    .lte('desde', hasta)
    .order('desde');
  if (error) throw new Error('No se pudieron leer las ventas de las semanas. Intenta de nuevo.');
  return ((data ?? []) as Fila[]).map(aVentaSemana);
}

/** Carga o reemplaza una semana (única por persona y primer día). */
export async function guardarVentaSemana(
  p: VentaSemana,
  adminId: string,
): Promise<void> {
  if (!Number.isFinite(p.totalBoletasMayores) || p.totalBoletasMayores < 0) {
    throw new Error('El total de boletas no puede ser negativo.');
  }
  if (p.montoVendido !== null && (!Number.isFinite(p.montoVendido) || p.montoVendido < 0)) {
    throw new Error('El monto vendido no puede ser negativo.');
  }
  const sb = getServerClient();
  const { error } = await sb.from('sueldo_ventas_semana').upsert(
    {
      empleado_id: p.empleadoId,
      desde: p.desde,
      hasta: p.hasta,
      total_boletas_mayores: p.totalBoletasMayores,
      meta_cumplida: p.metaCumplida,
      monto_vendido: p.montoVendido,
      creado_por: adminId,
    },
    { onConflict: 'empleado_id,desde' },
  );
  if (error) {
    if (String(error.message ?? '').includes('PERIODO_CERRADO:')) throw new Error(MSG_CERRADO);
    throw new Error('No se pudo guardar la semana. Intenta de nuevo.');
  }
}
