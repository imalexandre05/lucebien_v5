import { getServerClient } from './supabase/server';

export type ListaLavanderiaItem = {
  id: string;
  cod: string;
  tipo: string | null;
  color: string | null;
  talla: string | null;
  obs: string | null;
  motivo: string | null;
  estadoRetorno: string | null;
};

export type ListaLavanderia = {
  id: string;
  sedeCod: string;
  tipo: string;
  estado: string;
  validadoTienda: boolean;
  obsRetorno: string | null;
  fecha: string;
  respInv: string | null;
  respTraslado: string | null;
  camisas: number;
  corbatas: number;
  michis: number;
  corbatones: number;
  portaTernos: number;
  zapatos: number;
  items: ListaLavanderiaItem[];
};

type Row = {
  id: string;
  sede_cod: string;
  tipo: string;
  estado: string;
  validado_tienda: boolean;
  obs_retorno: string | null;
  fecha: string;
  resp_inv: string | null;
  resp_traslado: string | null;
  camisas: number;
  corbatas: number;
  michis: number;
  corbatones: number;
  porta_ternos: number;
  zapatos: number;
  lista_items: {
    id: string;
    cod: string;
    tipo: string | null;
    color: string | null;
    talla: string | null;
    obs: string | null;
    motivo: string | null;
    estado_retorno: string | null;
  }[];
};

const fromRow = (r: Row): ListaLavanderia => ({
  id: r.id,
  sedeCod: r.sede_cod,
  tipo: r.tipo,
  estado: r.estado,
  validadoTienda: Boolean(r.validado_tienda),
  obsRetorno: r.obs_retorno,
  fecha: r.fecha,
  respInv: r.resp_inv,
  respTraslado: r.resp_traslado,
  camisas: r.camisas,
  corbatas: r.corbatas,
  michis: r.michis,
  corbatones: r.corbatones,
  portaTernos: r.porta_ternos,
  zapatos: r.zapatos,
  items: (r.lista_items ?? []).map((i) => ({
    id: i.id,
    cod: i.cod,
    tipo: i.tipo,
    color: i.color,
    talla: i.talla,
    obs: i.obs,
    motivo: i.motivo,
    estadoRetorno: i.estado_retorno,
  })),
});

// RLS (0006) ya filtra por sede — sin filtro extra acá, la tienda solo ve lo suyo.
export async function listarListasLavanderia(): Promise<ListaLavanderia[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('listas_lavanderia')
    .select('*, lista_items(*)')
    .order('fecha', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

export type ItemEnvio = {
  cod: string;
  tipo: string;
  color: string;
  talla: string;
  obs: string;
  motivo: string;
  destino: 'recepcion' | 'compostura';
};

export type GeneralesEnvio = {
  camisas: number;
  corbatas: number;
  michis: number;
  corbatones: number;
  portaTernos: number;
  zapatos: number;
};

// tipo 'LAV' (envío general, con accesorios) o 'REF' (refacción: solo prendas, van a
// compostura directo — ver lavanderia_enviar en la migración 0066).
export async function enviarLavanderia(p: {
  sede: string;
  tipo: 'LAV' | 'REF';
  respInv: string;
  respTraslado: string;
  generales: GeneralesEnvio;
  items: ItemEnvio[];
}): Promise<string> {
  const sb = getServerClient();
  const { data, error } = await sb.rpc('lavanderia_enviar', {
    p_sede: p.sede,
    p_tipo: p.tipo,
    p_resp_inv: p.respInv,
    p_resp_traslado: p.respTraslado,
    p_generales: {
      camisas: p.generales.camisas,
      corbatas: p.generales.corbatas,
      michis: p.generales.michis,
      corbatones: p.generales.corbatones,
      porta_ternos: p.generales.portaTernos,
      zapatos: p.generales.zapatos,
    },
    p_items: p.items,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function validarRetornoLavanderia(p: {
  id: string;
  items: { id: string; estado: 'bien' | 'problema' }[];
  obsRetorno: string;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb.rpc('lavanderia_validar_retorno', {
    p_id: p.id,
    p_items: p.items,
    p_obs_retorno: p.obsRetorno || null,
  });
  if (error) throw new Error(error.message);
}
