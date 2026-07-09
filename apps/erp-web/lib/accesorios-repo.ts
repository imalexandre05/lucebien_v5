import { getServerClient } from './supabase/server';

// Envíos de accesorios a granel (envios_accesorios + items, 0005): flujo paralelo
// al de prendas — el almacén remite corbatas/michis por cantidad y la tienda valida
// el envío completo (validado_tienda), no pieza por pieza.

export type ItemAccesorio = { tipo: string; cantidad: number };

export type EnvioAccesorios = {
  id: string;
  sedeDestinoCod: string;
  fecha: string;
  validadoTienda: boolean;
  fechaValidado: string | null;
  obs: string | null;
  items: ItemAccesorio[];
};

export async function listarEnviosAccesorios(): Promise<EnvioAccesorios[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('envios_accesorios')
    .select('id, sede_destino_cod, fecha, validado_tienda, fecha_validado, obs, envio_accesorios_items(tipo, cantidad)')
    .order('fecha', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    sedeDestinoCod: String(r.sede_destino_cod),
    fecha: String(r.fecha ?? ''),
    validadoTienda: Boolean(r.validado_tienda),
    fechaValidado: (r.fecha_validado as string | null) ?? null,
    obs: (r.obs as string | null) ?? null,
    items: ((r.envio_accesorios_items as { tipo: string; cantidad: number }[]) ?? []).map((i) => ({
      tipo: i.tipo,
      cantidad: Number(i.cantidad) || 0,
    })),
  }));
}

// Tipos ya usados, para sugerir en el formulario (sin inventar catálogo fijo).
export async function tiposAccesorioUsados(): Promise<string[]> {
  const sb = getServerClient();
  const { data } = await sb.from('envio_accesorios_items').select('tipo').limit(300);
  const tipos = new Set<string>();
  for (const r of (data as { tipo: string }[]) ?? []) if (r.tipo) tipos.add(r.tipo);
  return Array.from(tipos).sort();
}

export async function crearEnvioAccesorios(p: {
  sedeDestinoCod: string;
  obs: string | null;
  items: ItemAccesorio[];
}): Promise<void> {
  const sb = getServerClient();
  const { data: u } = await sb.auth.getUser();
  const { data: envio, error } = await sb
    .from('envios_accesorios')
    .insert({
      sede_destino_cod: p.sedeDestinoCod,
      fecha: new Date().toISOString(),
      responsable_id: u?.user?.id ?? null,
      obs: p.obs,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const { error: eItems } = await sb.from('envio_accesorios_items').insert(
    p.items.map((i) => ({ envio_id: envio.id, tipo: i.tipo, cantidad: i.cantidad })),
  );
  if (eItems) throw new Error(eItems.message);
}

export async function validarEnvioAccesorios(id: string): Promise<void> {
  const sb = getServerClient();
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb
    .from('envios_accesorios')
    .update({ validado_tienda: true, validado_por_id: u?.user?.id ?? null, fecha_validado: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
