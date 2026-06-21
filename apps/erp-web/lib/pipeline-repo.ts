import type { PrendaPasada, EtapaPipeline } from '@scilb/core';
import { clavePuntos, puntosAvance, esMediaPrenda } from '@scilb/core';
import { getServerClient } from './supabase/server';

type Row = {
  id: string;
  activo_id: string | null;
  pedido_id: string | null;
  codigo: string;
  tipo: string | null;
  color: string | null;
  talla: string | null;
  etapa: PrendaPasada['etapa'];
  tipo_lavado: string | null;
  sede_origen_cod: string | null;
  lavador_id: string | null;
  planchador_id: string | null;
  necesita_compostura: boolean | null;
  obs_refaccion: string | null;
  obs_compostura: string | null;
  obs_calidad: string | null;
  obs_general: string | null;
  aprobada: boolean | null;
  envio_id: string | null;
  lista_lavanderia_id: string | null;
  dividida: boolean | null;
  dividida_en: string | null;
  fecha_ingreso: string;
  fecha_actualizado: string | null;
};

const fromRow = (r: Row): PrendaPasada => ({
  id: r.id,
  activoId: r.activo_id,
  pedidoId: r.pedido_id,
  codigo: r.codigo,
  tipo: r.tipo ?? '',
  color: r.color,
  talla: r.talla,
  etapa: r.etapa,
  tipoLavado: r.tipo_lavado,
  sedeOrigenCod: r.sede_origen_cod ?? '',
  lavadorId: r.lavador_id,
  planchadorId: r.planchador_id,
  necesitaCompostura: Boolean(r.necesita_compostura),
  obsRefaccion: r.obs_refaccion,
  obsCompostura: r.obs_compostura,
  obsCalidad: r.obs_calidad,
  obsGeneral: r.obs_general,
  aprobada: Boolean(r.aprobada),
  envioId: r.envio_id,
  listaLavanderiaId: r.lista_lavanderia_id,
  dividida: Boolean(r.dividida),
  divididaEn: r.dividida_en,
  fechaIngreso: (r.fecha_ingreso ?? '').slice(0, 10),
  fechaActualizado: r.fecha_actualizado,
});

export async function listarPasadas(): Promise<PrendaPasada[]> {
  const sb = getServerClient();
  const { data, error } = await sb
    .from('prenda_pasada')
    .select('*')
    .order('fecha_ingreso', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(fromRow);
}

// Llamado al crear un pedido de servicio: la prenda entra al pipeline interno (E5).
export async function crearPasadaDesdePedido(p: {
  codigo: string;
  tipo: string;
  sedeOrigenCod: string;
  pedidoId: string;
}): Promise<void> {
  const sb = getServerClient();
  const { error } = await sb
    .from('prenda_pasada')
    .insert({
      codigo: p.codigo,
      tipo: p.tipo,
      sede_origen_cod: p.sedeOrigenCod,
      pedido_id: p.pedidoId,
      etapa: 'recepcion',
    });
  if (error) throw new Error(error.message);
}

// Avanza una prenda a `destino`: actualiza la pasada, registra el movimiento en el historial
// y otorga los puntos de la etapa COMPLETADA (la actual) al actor = auth.uid(). Las reglas de
// dominio (transiciones, ½ punto, clave de puntos) viven en @scilb/core; los pesos en config.
// Portado de routes/pipeline.js (PUT /:id/avanzar). No es atómico (varias escrituras); si
// hiciera falta se endurece con un RPC transaccional.
export async function avanzarPasada(id: string, destino: string, obs?: string): Promise<void> {
  const sb = getServerClient();
  const { data: userData } = await sb.auth.getUser();
  const actor = userData.user?.id;
  if (!actor) throw new Error('No autenticado');

  const { data, error } = await sb.from('prenda_pasada').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  const pr = data as Row | null;
  if (!pr) throw new Error('Prenda no encontrada');
  if (pr.dividida) throw new Error('Prenda dividida — usar las piezas separadas');

  // Peso de puntos de la etapa que se completa (la actual); ½ si es pieza suelta.
  const { data: cfg } = await sb
    .from('config')
    .select('valor')
    .eq('clave', clavePuntos(pr.etapa as EtapaPipeline, pr.tipo_lavado))
    .maybeSingle();
  const peso = cfg ? parseFloat((cfg as { valor: string }).valor) : 1;
  const pts = puntosAvance(peso, pr.tipo);

  const patch: Record<string, unknown> = {
    etapa: destino,
    fecha_actualizado: new Date().toISOString(),
  };
  if (pr.etapa === 'recepcion') patch.lavador_id = actor; // quien saca de recepción = lavador
  if (pr.etapa === 'planchado') patch.planchador_id = actor; // quien plancha
  if (destino === 'listo') patch.aprobada = true;
  const obsField: Record<string, string> = {
    refaccion: 'obs_refaccion',
    compostura: 'obs_compostura',
    control_calidad: 'obs_calidad',
  };
  if (obs && obsField[destino]) patch[obsField[destino]] = obs;

  const upd = await sb.from('prenda_pasada').update(patch).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);

  const hist = await sb.from('prenda_historial').insert({
    pasada_id: id,
    etapa_anterior: pr.etapa,
    etapa_nueva: destino,
    empleado_id: actor,
    obs: obs || null,
  });
  if (hist.error) throw new Error(hist.error.message);

  if (pts > 0) {
    const pun = await sb.from('pipeline_puntos').insert({
      empleado_id: actor,
      pasada_id: id,
      etapa: pr.etapa,
      puntos: pts,
      detalle: `${pr.codigo}: ${pr.etapa}→${destino}${esMediaPrenda(pr.tipo) ? ' (½)' : ''}`,
      fecha: new Date().toISOString(),
    });
    if (pun.error) throw new Error(pun.error.message);
  }
}

// Envía una prenda "listo" a una tienda: crea el envío, marca la prenda como enviada y lo
// registra en el historial. El envío no otorga puntos. Portado de routes/pipeline.js
// (POST /enviar), versión por-prenda (el viejo permite lote).
export async function enviarPasada(id: string, sedeDestino: string): Promise<void> {
  const sb = getServerClient();
  const { data: userData } = await sb.auth.getUser();
  const actor = userData.user?.id;
  if (!actor) throw new Error('No autenticado');

  const { data, error } = await sb
    .from('prenda_pasada')
    .select('id, etapa, codigo')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pr = data as { id: string; etapa: string; codigo: string } | null;
  if (!pr) throw new Error('Prenda no encontrada');
  if (pr.etapa !== 'listo') throw new Error('Solo se envían prendas en estado "listo"');

  const env = await sb
    .from('envios_prendas')
    .insert({
      sede_destino_cod: sedeDestino,
      fecha: new Date().toISOString(),
      responsable_id: actor,
      estado: 'enviado',
    })
    .select('id')
    .single();
  if (env.error) throw new Error(env.error.message);
  const envioId = (env.data as { id: string }).id;

  const upd = await sb
    .from('prenda_pasada')
    .update({ etapa: 'enviado', envio_id: envioId, fecha_actualizado: new Date().toISOString() })
    .eq('id', id);
  if (upd.error) throw new Error(upd.error.message);

  const hist = await sb.from('prenda_historial').insert({
    pasada_id: id,
    etapa_anterior: 'listo',
    etapa_nueva: 'enviado',
    empleado_id: actor,
    obs: `Envío ${envioId.slice(0, 8)} → ${sedeDestino}`,
  });
  if (hist.error) throw new Error(hist.error.message);
}
